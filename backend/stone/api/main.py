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
from stone.figures import check_figures, html_to_text
from stone.portfolio import reconcile as rc
from stone.portfolio.exposure import bad_day_return, board_rows
from stone.portfolio.risk import BASIS as RISK_BASIS
from stone.portfolio.risk import portfolio_risk
from stone.signals import engine, service
from stone.sources.gemini import MODEL as GEMINI_MODEL
from stone.sources.gemini import GeminiClient, ScreenshotUnreadable, first_sentences
from stone.sources.sec import SecClient

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
    prices = c.execute("select day, open, high, low, close from prices_daily where ticker = %s order by day",
                       (t,)).fetchall()
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
        "prices": [{"day": p["day"].isoformat(), "open": float(p["open"]), "high": float(p["high"]),
                    "low": float(p["low"]), "close": float(p["close"])} for p in prices],
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


FUND_TOP = 25  # holdings listed on a fund page, largest first


def lite_line(results: list[engine.Result] | None) -> str | None:
    """The board's plain sentence for a holding (same words as liteSummary in frontend words.ts)."""
    if results is None:
        return None
    firing = [r for r in results if r.firing]
    strong = next((r for r in firing if r.label == engine.STRONG), None)
    if strong:
        return f"{engine.ALL_SPECS[strong.signal].lite}, and for this stock that has mattered before."
    if firing:
        return f"{engine.ALL_SPECS[firing[0].signal].lite}, but that hasn't clearly mattered here before."
    return "Nothing important today."


PERFORMANCE_BASIS = "trading days: 21/63/252, price only, dividends not included"


def return_over(closes: list[tuple], bars: int) -> float | None:
    """Last close vs the close `bars` trading days earlier (21 ~ a month); None without that much history."""
    return closes[-1][1] / closes[-1 - bars][1] - 1 if len(closes) > bars else None


@app.get("/api/funds/{symbol}")
def fund(symbol: str, c: psycopg.Connection = Conn):
    """A fund page: what's in it, how it's doing, what's next. Holdings come from the issuer's file."""
    co = company_or_404(c, symbol)
    if co["kind"] != "etf":
        raise HTTPException(400, f"{co['ticker']} is a stock, not a fund")
    t = co["ticker"]
    closes = [(r["day"], float(r["close"])) for r in c.execute(
        "select day, close from prices_daily where ticker = %s order by day", (t,)).fetchall()]
    as_of = c.execute("select max(as_of) as d from etf_holdings where etf = %s", (t,)).fetchone()["d"]
    rows = c.execute("select holding, weight, source from etf_holdings where etf = %s and as_of = %s "
                     "order by weight desc", (t, as_of)).fetchall() if as_of else []
    tracked = {r["ticker"]: r for r in c.execute(
        "select ticker, name, kind from companies where ticker = any(%s)", ([r["holding"] for r in rows],)).fetchall()}
    market_symbol, market = service.load_market(c)
    rates = service.load_rates(c)
    holdings = []
    for r in rows[:FUND_TOP]:
        k = tracked.get(r["holding"])
        results = signal_results(c, r["holding"], k["kind"], market_symbol, rates, market) if k else None
        holdings.append({"ticker": r["holding"], "name": k["name"] if k else None, "weight": float(r["weight"]),
                         "in_stone": k is not None, "state": state_of(results),
                         "firing": [{"signal": x.signal, "label": x.label} for x in results or [] if x.firing],
                         "lite_line": lite_line(results)})
    fund_results = signal_results(c, t, co["kind"], market_symbol, rates, market)
    day = c.execute("select max(day) as d from prices_daily").fetchone()["d"]
    start = day - timedelta(days=WEEK_DAYS - 1) if day else None
    top = {h["ticker"] for h in holdings}
    week = [f for f in filed_between(c, start, day) if f["ticker"] in top] if day else []
    return {
        "symbol": t, "name": co["name"],
        "price": {"last_close": closes[-1][1], "as_of": closes[-1][0].isoformat(),
                  "prev_close": closes[-2][1] if len(closes) > 1 else None,
                  "change_1d": return_over(closes, 1)} if closes else None,
        "performance": {"d30": return_over(closes, 21), "d90": return_over(closes, 63), "y1": return_over(closes, 252),
                        "as_of": closes[-1][0].isoformat() if closes else None, "basis": PERFORMANCE_BASIS},
        "fund_state": state_of(fund_results),
        "fund_firing": [result_json(r, with_cases=False) for r in fund_results or [] if r.firing],
        "holdings_as_of": as_of.isoformat() if as_of else None,
        "holdings_source": rows[0]["source"] if rows else None,
        "total_holdings_count": len(rows),
        "looked_through_share": sum(float(r["weight"]) for r in rows if r["holding"] in tracked),
        "holdings": holdings,
        "heads_up": [{"ticker": h["ticker"], "name": h["name"], "weight": h["weight"]}
                     for h in holdings if h["state"] == engine.WATCH],
        "filings_span": {"start": start.isoformat(), "end": day.isoformat()} if day else None,
        "week_filings": [{"ticker": f["ticker"], "form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
                          "url": filing_url(f["cik"], f["accession"], f["primary_doc"], f["source"])} for f in week],
        "note": None if rows else f"Holdings for {t} aren't loaded yet.",
    }


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


def risk_json(r, total: float | None = None) -> dict:
    out = {"volatility": r.volatility, "max_drawdown": r.max_drawdown,
           "drawdown_start": r.drawdown_start.isoformat(), "drawdown_bottom": r.drawdown_bottom.isoformat(),
           "beta": r.beta, "sharpe": r.sharpe, "worst_day": r.worst_day, "worst_day_on": r.worst_day_on.isoformat(),
           "total_return": r.total_return}
    if total is not None:
        out["max_drawdown_dollars"] = r.max_drawdown * total
        out["worst_day_dollars"] = r.worst_day * total
    return out


@app.post("/api/portfolio/risk")
def portfolio_risk_card(body: PortfolioIn, c: psycopg.Connection = Conn):
    """How bumpy this mix has been over Stone's price history, next to the market. Computed with QuantStats."""
    known = {r["ticker"] for r in c.execute("select ticker from companies").fetchall()}
    values: dict[str, float] = {}
    unknown = []
    for h in body.holdings:
        sym = h.symbol.strip().upper()
        last, _ = last_two_closes(c, sym) if sym in known else (None, None)
        if not last:
            unknown.append(sym)
            continue
        values[sym] = values.get(sym, 0.0) + h.shares * float(last["close"])
    market_symbol, _ = service.load_market(c)
    closes = {s: [(b.day, b.close) for b in service.load_bars(c, s)] for s in {*values, market_symbol}}
    got = portfolio_risk(closes, values, market_symbol)
    if got is None:
        raise HTTPException(422, "Not enough shared price history for these holdings.")
    mine, market, rets = got
    total = sum(values.values())
    return {
        "total": total, "symbols": sorted(values), "unknown": unknown, "market_symbol": market_symbol,
        "start": rets.index.min().date().isoformat(), "end": rets.index.max().date().isoformat(), "days": len(rets),
        "portfolio": risk_json(mine, total), "market": risk_json(market),
        "basis": RISK_BASIS, "source": "QuantStats on Stone's daily closes (Alpaca, IEX feed)",
    }


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


SUMMARY_FORMS = {"10-K", "10-Q", "8-K", "10-K/A", "10-Q/A", "8-K/A"}


def filing_text(cik: int | None, accession: str, primary_doc: str | None, source: str) -> str:
    """The filing's main document as plain text, from the SEC (cached after the first read)."""
    if source != "sec" or not cik or not primary_doc:
        raise HTTPException(400, "This filing has no SEC document to summarize.")
    settings = config.load()
    try:
        sec = SecClient(settings)
    except NotConnected:
        sec = SecClient(settings, offline=True)  # without SEC_USER_AGENT, only an already-cached document works
    try:
        return html_to_text(sec.document(cik, accession, primary_doc))
    except FileNotFoundError:
        raise HTTPException(503, "Reading filings from the SEC needs SEC_USER_AGENT (a contact email) to be set.")


@app.get("/api/filings/{accession}/summary")
def filing_summary(accession: str, c: psycopg.Connection = Conn):
    """Gemini's plain summary of a filing. Every figure it states is checked against the filing's own XBRL."""
    f = c.execute("""select f.accession, f.ticker, f.form, f.accepted_at, f.primary_doc, f.source, co.cik
                     from filings f join companies co on co.ticker = f.ticker where f.accession = %s""",
                  (accession,)).fetchone()
    if not f:
        raise HTTPException(404, f"No filing {accession}")
    if f["form"] not in SUMMARY_FORMS:
        raise HTTPException(400, "Summaries cover 10-K, 10-Q and 8-K filings.")
    try:
        client = GeminiClient(config.load())
    except NotConnected:
        raise HTTPException(503, "Filing summaries aren't connected yet (GEMINI_API_KEY is not set).")
    text = filing_text(f["cik"], accession, f["primary_doc"], f["source"])
    try:
        read, cached, generated = client.summarize_filing(text, f["ticker"], f["form"], accession)
    except ScreenshotUnreadable as e:
        raise HTTPException(422, str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Gemini returned HTTP {e.response.status_code} (model {GEMINI_MODEL}).")
    facts = c.execute("select concept, value, period_end from xbrl_facts where accession = %s and taxonomy = 'us-gaap'",
                      (accession,)).fetchall()
    return {
        "accession": accession, "ticker": f["ticker"], "form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
        "url": filing_url(f["cik"], accession, f["primary_doc"], f["source"]),
        "summary_lite": first_sentences(read.summary, 3),
        "figures": check_figures(read.figures, facts),
        "model": GEMINI_MODEL, "generated_at": generated.isoformat(), "cached": cached,
    }


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
