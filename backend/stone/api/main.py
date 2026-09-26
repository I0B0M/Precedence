"""Stone API. Every endpoint reads Postgres; none calls an outside API except
screenshot import, which calls Gemini (cached by image) once it is connected."""

from functools import lru_cache

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
from stone.sources.gemini import GeminiClient

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
    results = service.run_all(c, t) if co["kind"] == "stock" else {}
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
        "signals": [result_json(r) for r in results.values()],
        "state": engine.holding_state(list(results.values())) if results else None,
    }


@app.get("/api/scan")
def scan(c: psycopg.Connection = Conn):
    """The latest full scan: how many stock-signal pairs were tested and how many came out STRONG."""
    row = c.execute("select * from signal_scans order by run_at desc limit 1").fetchone()
    if not row:
        return None
    return {**row, "run_at": row["run_at"].isoformat(), "as_of": row["as_of"].isoformat(),
            "expected_by_chance": float(row["expected_by_chance"])}


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
        if known[sym]["kind"] == "stock":
            results = list(service.run_all(c, sym, rates, market).values())
            state = engine.holding_state(results)
        elif sym == market_symbol:  # the one fund tested on its own history: rate jumps and the market
            results = [service.run_market_rates(c)[1]]
            state = engine.holding_state(results)
        else:
            results, state = [], None  # a fund we never tested: no state, never CALM
        exposure.append({
            "symbol": sym, "name": known[sym]["name"], "sector": known[sym]["sector"],
            "direct": row.direct, "via_etf": row.via_etf, "total": row.shown,
            "share_of_total": row.shown / total if total else None,
            "bad_day_return": bad, "bad_day_loss": bad * row.shown if bad is not None else None,
            "state": state, "firing": [result_json(r, with_cases=False) for r in results if r.firing],
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


@app.post("/api/import/screenshot")
async def import_screenshot(file: UploadFile = File(...)):
    try:
        client = GeminiClient(config.load())
    except NotConnected:
        raise HTTPException(503, "Screenshot reading isn't connected yet (GEMINI_API_KEY is not set).")
    read = client.read_screenshot(await file.read(), file.content_type or "image/png")
    rows = [rc.Row(r.symbol, r.shares, r.price, r.value) for r in read.rows]
    return reconciled_json(rc.reconcile(rows, read.printed_total), rows)
