"""Stone API. Every endpoint reads Postgres; none calls an outside API except
screenshot import, which calls Gemini (cached by image) once it is connected."""

from datetime import timedelta
from functools import lru_cache

import httpx
import psycopg
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from stone import config
from stone.api.views import filing_url, latest_facts, result_json
from stone.config import NotConnected
from stone.portfolio import reconcile as rc
from stone.portfolio.exposure import bad_day_return, board_rows
from stone.signals import engine, service
from stone.sources.gemini import MODEL as GEMINI_MODEL
from stone.sources.gemini import GeminiClient, ScreenshotUnreadable

app = FastAPI(title="Stone")


@app.exception_handler(service.NoMarketData)
def no_market_data(_: Request, exc: service.NoMarketData):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@lru_cache
def pool() -> ConnectionPool:
    return ConnectionPool(config.load().database_url, min_size=1, max_size=5,
                          kwargs={"row_factory": dict_row}, open=True)


def conn():
    with pool().connection() as c:
        yield c


Conn = Depends(conn)


def company_or_404(c: psycopg.Connection, ticker: str) -> dict:
    row = c.execute("select * from companies where ticker = %s", (ticker.upper(),)).fetchone()
    if not row:
        raise HTTPException(404, f"No data for {ticker.upper()}")
    return row


def signal_results(c: psycopg.Connection, sym: str, kind: str, market_symbol: str,
                   rates: list | None = None, market: list | None = None) -> list[engine.Result] | None:
    """A stock's own signals; for the market fund (SPY), the rate-jump test run on the market itself;
    None for a fund we never tested (it gets no state, never CALM)."""
    if kind == "stock":
        return list(service.run_all(c, sym, rates, market).values())
    if sym == market_symbol:
        return [service.run_market_rates(c)[1]]
    return None


def state_of(results: list[engine.Result] | None) -> str | None:
    return engine.holding_state(results) if results is not None else None


def last_two_closes(c: psycopg.Connection, ticker: str) -> tuple[dict | None, float | None]:
    rows = c.execute("select day, close from prices_daily where ticker = %s order by day desc limit 2",
                     (ticker,)).fetchall()
    if not rows:
        return None, None
    change = float(rows[0]["close"]) / float(rows[1]["close"]) - 1 if len(rows) == 2 else None
    return rows[0], change


@app.get("/api/status")
def status(c: psycopg.Connection = Conn):
    counts = {r["source"]: r["n"] for r in c.execute(
        "select source, count(*) as n from companies group by source").fetchall()}
    real = sum(n for s, n in counts.items() if s != "sample")
    data = "empty" if not counts else "sample" if not real else "mixed" if "sample" in counts else "real"
    return {"data": data, "companies_by_source": counts}


@app.get("/api/companies")
def companies(c: psycopg.Connection = Conn):
    out = []
    for row in c.execute("select ticker, name, sector, kind, source from companies order by ticker").fetchall():
        last, change = last_two_closes(c, row["ticker"])
        out.append({**row, "last_close": float(last["close"]) if last else None,
                    "as_of": last["day"].isoformat() if last else None, "change": change})
    return out


@app.get("/api/companies/{ticker}")
def company(ticker: str, c: psycopg.Connection = Conn):
    co = company_or_404(c, ticker)
    t = co["ticker"]
    prices = c.execute("select day, open, close from prices_daily where ticker = %s order by day", (t,)).fetchall()
    last, change = last_two_closes(c, t)
    filings = c.execute(
        """select accession, form, filed_date, accepted_at, report_date, primary_doc, source from filings
           where ticker = %s and form <> '4' order by accepted_at desc limit 12""", (t,)).fetchall()
    sales = c.execute(
        """select accepted_at, owner_name, owner_title, transaction_date, shares, price, accession, seq
           from insider_trades where ticker = %s and code = 'S' order by accepted_at desc, seq limit 15""", (t,)).fetchall()
    rate = c.execute("select day, value from rates where series = 'DGS10' order by day desc limit 1").fetchone()
    results = signal_results(c, t, co["kind"], service.load_market(c)[0])
    return {
        "company": co,
        "last": {"close": float(last["close"]), "day": last["day"].isoformat(), "change": change} if last else None,
        "prices": [{"day": p["day"].isoformat(), "open": float(p["open"]), "close": float(p["close"])} for p in prices],
        "filings": [{**f, "filed_date": f["filed_date"].isoformat(), "accepted_at": f["accepted_at"].isoformat(),
                     "report_date": f["report_date"].isoformat() if f["report_date"] else None,
                     "url": filing_url(co["cik"], f["accession"], f["primary_doc"], f["source"])} for f in filings],
        "insider_sales": [{**s, "accepted_at": s["accepted_at"].isoformat(),
                           "transaction_date": s["transaction_date"].isoformat() if s["transaction_date"] else None,
                           "shares": float(s["shares"]) if s["shares"] is not None else None,
                           "price": float(s["price"]) if s["price"] is not None else None} for s in sales],
        "facts": latest_facts(c, t),
        "rate": {"day": rate["day"].isoformat(), "value": float(rate["value"])} if rate else None,
        "signals": [result_json(r) for r in results or []],
        "state": state_of(results),
    }


@app.get("/api/scan")
def scan(c: psycopg.Connection = Conn):
    """The latest full scan: how many stock-signal pairs were tested and how many came out STRONG."""
    row = c.execute("select * from signal_scans order by run_at desc limit 1").fetchone()
    if not row:
        return None
    return {**row, "run_at": row["run_at"].isoformat(), "as_of": row["as_of"].isoformat(),
            "expected_by_chance": float(row["expected_by_chance"])}


def filed_between(c: psycopg.Connection, start, end) -> list[dict]:
    """Filings accepted on these ET days. A Form 4 counts only when its lines were parsed for that
    company, so it is a trade in the company's own stock and not the company selling someone else's."""
    return c.execute(
        """select f.ticker, f.form, f.accession, f.accepted_at, f.primary_doc, f.source, co.cik from filings f
           join companies co on co.ticker = f.ticker
           where (f.accepted_at at time zone 'America/New_York')::date between %s and %s
             and (f.form <> '4' or exists (select 1 from insider_trades i
                                           where i.accession = f.accession and i.ticker = f.ticker))
           order by f.accepted_at""", (start, end)).fetchall()


def filings_block(filed: list[dict], as_of, source: str) -> dict:
    by_form: dict[str, int] = {}
    for f in filed:
        by_form[f["form"]] = by_form.get(f["form"], 0) + 1
    return {"count": len(filed), "companies": len({f["ticker"] for f in filed}), "by_form": by_form,
            "as_of": as_of.isoformat() if as_of else None, "source": source}


WEEK_DAYS = 7


@app.get("/api/today")
def today(symbols: str | None = None, c: psycopg.Connection = Conn):
    """The start screen's counts for the last trading day, from the database only.
    symbols: optional comma-separated holdings, e.g. ?symbols=BX,AMZN,SPY."""
    day = c.execute("select max(day) as d from prices_daily").fetchone()["d"]
    filed = filed_between(c, day, day)
    week_start = day - timedelta(days=WEEK_DAYS - 1) if day else None
    week_filed = filed_between(c, week_start, day)
    filing_sources = ",".join(r["source"] for r in c.execute("select distinct source from filings order by 1"))

    rate = c.execute("select day, value, source from rates where series = 'DGS10' order by day desc limit 1").fetchone()
    week = rate and c.execute("select value from rates where series = 'DGS10' and day <= %s order by day desc limit 1",
                              (rate["day"] - timedelta(days=7),)).fetchone()
    out = {
        "day": day.isoformat() if day else None,
        "market": {
            "filings": filings_block(filed, day, filing_sources),
            "rate": {"series": "DGS10", "day": rate["day"].isoformat(), "value": float(rate["value"]),
                     "change_week": round(float(rate["value"] - week["value"]), 4) if week else None,
                     "known_at": engine.rate_known_at(rate["day"]).isoformat(), "source": rate["source"]}
                    if rate else None,
        },
        "week": None,
        "holdings": None,
    }
    if day:
        readings = c.execute("select day, value, source from rates where series = 'DGS10' and day between %s and %s "
                             "order by day", (week_start, day)).fetchall()
        jumps = [e for e in engine.detect_rate_jumps(service.load_rates(c))
                 if week_start <= e.known_at.date() <= day]
        out["week"] = {
            "start": week_start.isoformat(), "end": day.isoformat(), "days": WEEK_DAYS,
            "filings": filings_block(week_filed, day, filing_sources),
            "rate": {"series": "DGS10", "first_day": readings[0]["day"].isoformat(),
                     "first_value": float(readings[0]["value"]), "last_day": readings[-1]["day"].isoformat(),
                     "last_value": float(readings[-1]["value"]),
                     "change": round(float(readings[-1]["value"] - readings[0]["value"]), 4),
                     "jumps": [{"known_at": e.known_at.isoformat(), "note": e.note} for e in jumps],
                     "source": readings[-1]["source"]} if readings else None,
        }
    if not symbols:
        return out

    wanted = list(dict.fromkeys(s.strip().upper() for s in symbols.split(",") if s.strip()))
    kinds = {r["ticker"]: r["kind"] for r in c.execute(
        "select ticker, kind from companies where ticker = any(%s)", (wanted,)).fetchall()}
    held = [s for s in wanted if s in kinds]
    market_symbol, market = service.load_market(c)
    rates = service.load_rates(c)
    firing = [{"symbol": s, "signal": r.signal, "label": r.label}
              for s in held for r in signal_results(c, s, kinds[s], market_symbol, rates, market) or [] if r.firing]
    mine = [f for f in filed if f["ticker"] in held]
    mine_week = [f for f in week_filed if f["ticker"] in held]
    out["holdings"] = {
        "symbols": held, "unknown": [s for s in wanted if s not in kinds],
        "filings": {"count": len(mine), "as_of": out["day"], "source": filing_sources,
                    "items": [{"ticker": f["ticker"], "form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
                               "url": filing_url(f["cik"], f["accession"], f["primary_doc"], f["source"])}
                              for f in mine]},
        "week_filings": {"count": len(mine_week), "start": out["week"]["start"] if out["week"] else None,
                         "as_of": out["day"], "source": filing_sources,
                         "items": [{"ticker": f["ticker"], "form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
                                    "url": filing_url(f["cik"], f["accession"], f["primary_doc"], f["source"])}
                                   for f in mine_week]},
        "signals": {"firing": len(firing), "strong_firing": sum(1 for x in firing if x["label"] == engine.STRONG),
                    "items": firing, "as_of": out["day"], "source": "Stone signal engine (prices, SEC, FRED)"},
    }
    return out


@app.get("/api/market/rate_jump")
def market_rate_jump(c: psycopg.Connection = Conn):
    """Rate jumps and the whole market: the plain "was it lower?" test run on SPY itself."""
    symbol, r = service.run_market_rates(c)
    return {"symbol": symbol, **result_json(r)}


@app.get("/api/lab/signals")
def lab_signals():
    return [{"key": s.key, "lite": s.lite, "pro": s.pro, "horizon": s.horizon} for s in engine.SPECS.values()]


@app.get("/api/lab/{ticker}/{signal}")
def lab(ticker: str, signal: str, c: psycopg.Connection = Conn):
    co = company_or_404(c, ticker)
    if signal not in engine.SPECS:
        raise HTTPException(404, f"Unknown signal {signal}")
    if co["kind"] != "stock":
        raise HTTPException(400, "Signals run on stocks, not funds")
    return result_json(service.run_one(c, co["ticker"], signal))


class HoldingIn(BaseModel):
    symbol: str
    shares: float


class PortfolioIn(BaseModel):
    holdings: list[HoldingIn]


@app.post("/api/portfolio")
def portfolio(body: PortfolioIn, c: psycopg.Connection = Conn):
    known = {r["ticker"]: r for r in c.execute("select * from companies").fetchall()}
    rows, values, unknown = [], {}, []
    for h in body.holdings:
        sym = h.symbol.strip().upper()
        last, change = last_two_closes(c, sym) if sym in known else (None, None)
        if not last:
            unknown.append(sym)
            continue
        value = h.shares * float(last["close"])
        values[sym] = values.get(sym, 0.0) + value
        rows.append({"symbol": sym, "name": known[sym]["name"], "kind": known[sym]["kind"], "shares": h.shares,
                     "price": float(last["close"]), "value": value, "change": change, "day": last["day"]})

    etfs = [s for s in values if known[s]["kind"] == "etf"]
    weights: dict[str, dict[str, float]] = {}
    funds = []
    for etf in etfs:
        latest = c.execute("select max(as_of) as d from etf_holdings where etf = %s", (etf,)).fetchone()["d"]
        rows_ = c.execute("select holding, weight, source from etf_holdings where etf = %s and as_of = %s",
                          (etf, latest)).fetchall()
        # only stocks we have data for are split out; the rest of the fund stays as the fund itself
        weights[etf] = {r["holding"]: float(r["weight"]) for r in rows_ if r["holding"] in known}
        funds.append({"symbol": etf, "as_of": latest.isoformat() if latest else None,
                      "source": rows_[0]["source"] if rows_ else None,
                      "looked_through": sum(weights[etf].values())})
    total = sum(values.values())
    rates = service.load_rates(c)
    market_symbol, market = service.load_market(c)

    exposure = []
    for sym, row in board_rows(values, weights).items():
        bars = service.load_bars(c, sym)
        bad = bad_day_return([b.close for b in bars])
        results = signal_results(c, sym, known[sym]["kind"], market_symbol, rates, market)
        exposure.append({
            "symbol": sym, "name": known[sym]["name"], "sector": known[sym]["sector"],
            "direct": row.direct, "via_etf": row.via_etf, "total": row.shown,
            "share_of_total": row.shown / total if total else None,
            "bad_day_return": bad, "bad_day_loss": bad * row.shown if bad is not None else None,
            "state": state_of(results), "firing": [result_json(r, with_cases=False) for r in results or [] if r.firing],
            "children": [{"symbol": k, "name": known[k]["name"], "total": v}
                         for k, v in sorted(row.children.items(), key=lambda kv: -kv[1])],
        })
    exposure.sort(key=lambda e: (e["state"] != engine.WATCH, -e["total"]))
    price_as_of = max((r.pop("day") for r in rows), default=None)  # the close the values are priced at
    return {"total": total, "rows": rows, "exposure": exposure, "unknown": unknown, "funds": funds,
            "price_as_of": price_as_of.isoformat() if price_as_of else None}


class ReadRowIn(BaseModel):
    symbol: str
    shares: float | None = None
    price: float | None = None
    value: float | None = None


class ReconcileIn(BaseModel):
    rows: list[ReadRowIn]
    printed_total: float | None = None


def reconciled_json(r: rc.Reconciled, rows: list[rc.Row]) -> dict:
    return {"status": r.status, "rows_sum": r.rows_sum, "printed_total": r.printed_total,
            "difference": r.difference, "message": r.message,
            "rows": [{"symbol": row.symbol, "shares": row.shares, "price": row.price, "value": row.value,
                      "ok": chk.ok, "problem": chk.problem, "fix": chk.fix} for row, chk in zip(rows, r.rows)]}


@app.post("/api/import/reconcile")
def reconcile_rows(body: ReconcileIn):
    rows = [rc.Row(r.symbol.strip().upper(), r.shares, r.price, r.value) for r in body.rows]
    return reconciled_json(rc.reconcile(rows, body.printed_total), rows)


MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024  # Gemini takes inline images up to ~20 MB per request


@app.post("/api/import/screenshot")
async def import_screenshot(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(415, "That isn't an image. Add a screenshot (PNG or JPEG).")
    image = await file.read()
    if len(image) > MAX_SCREENSHOT_BYTES:
        raise HTTPException(413, "That screenshot is too large (over 15 MB).")
    try:
        client = GeminiClient(config.load())
    except NotConnected:
        raise HTTPException(503, "Screenshot reading isn't connected yet (GEMINI_API_KEY is not set).")
    try:
        read = client.read_screenshot(image, file.content_type)
    except ScreenshotUnreadable as e:
        raise HTTPException(422, f"{e} You can type the rows instead.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Gemini returned HTTP {e.response.status_code} "
                                 f"(model {GEMINI_MODEL}). You can type the rows instead.")
    rows = [rc.Row(r.symbol, r.shares, r.price, r.value) for r in read.rows]
    return reconciled_json(rc.reconcile(rows, read.printed_total), rows)
