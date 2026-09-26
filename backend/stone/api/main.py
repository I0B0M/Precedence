"""Stone API. Every endpoint reads Postgres; none calls an outside API except
screenshot import, which calls Gemini (cached by image) once it is connected."""

from functools import lru_cache

import psycopg
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from stone import config
from stone.api.views import filing_url, latest_facts, result_json
from stone.config import NotConnected
from stone.portfolio import reconcile as rc
from stone.portfolio.exposure import bad_day_return, exposures
from stone.signals import engine, service
from stone.sources.gemini import GeminiClient

app = FastAPI(title="Stone")


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
        """select accepted_at, owner_name, owner_title, transaction_date, shares, price, accession
           from insider_trades where ticker = %s and code = 'S' order by accepted_at desc limit 15""", (t,)).fetchall()
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
                     "price": float(last["close"]), "value": value, "change": change})

    etfs = [s for s in values if known[s]["kind"] == "etf"]
    weights: dict[str, dict[str, float]] = {}
    for etf in etfs:
        latest = c.execute("select max(as_of) as d from etf_holdings where etf = %s", (etf,)).fetchone()["d"]
        weights[etf] = {r["holding"]: float(r["weight"]) for r in c.execute(
            "select holding, weight from etf_holdings where etf = %s and as_of = %s", (etf, latest)).fetchall()}
    total = sum(values.values())
    rates = service.load_rates(c)

    exposure = []
    for sym, ex in exposures(values, weights).items():
        if sym not in known:
            continue  # an ETF holding we have no data for
        bars = service.load_bars(c, sym)
        bad = bad_day_return([b.close for b in bars])
        results = service.run_all(c, sym, rates) if known[sym]["kind"] == "stock" else {}
        firing = [result_json(r, with_cases=False) for r in results.values() if r.firing]
        exposure.append({
            "symbol": sym, "name": known[sym]["name"], "sector": known[sym]["sector"],
            "direct": ex.direct, "via_etf": ex.via_etf, "total": ex.total,
            "share_of_total": ex.total / total if total else None,
            "bad_day_return": bad, "bad_day_loss": bad * ex.total if bad is not None else None,
            "state": engine.holding_state(list(results.values())) if results else engine.CALM,
            "firing": firing,
        })
    exposure.sort(key=lambda e: (e["state"] != engine.WATCH, -e["total"]))
    return {"total": total, "rows": rows, "exposure": exposure, "unknown": unknown}


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
