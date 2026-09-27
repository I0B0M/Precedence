"""Precedence API. Endpoints read Postgres. The outside calls are all cached: Gemini (screenshot import,
filing summary, once a key is set), the SEC (a filing's document for a summary) and the Census
geocoder (home estimate)."""

import os
from datetime import datetime, time, timedelta
from functools import lru_cache
from typing import Literal

import httpx
import psycopg
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from stone import config
from stone.api.views import SOURCE_NAMES, filing_url, latest_facts, result_json, vs_market_words
from stone import homes, retirement
from stone.names import display_name
from stone.briefing.panel import briefing_json, company_briefing, portfolio_briefing
from stone.config import NotConnected
from stone.figures import check_figures, html_to_text
from stone.ingest.tickers import HOLDINGS_FROM
from stone.portfolio import reconcile as rc
from stone.portfolio.exposure import bad_day_return, board_rows
from stone.portfolio.holdings import Holding, holdings_key, last_two_closes, price_holdings
from stone.portfolio.risk import BASIS as RISK_BASIS
from stone.portfolio.risk import portfolio_risk
from stone.signals import engine, service
from stone.signals.scan import fdr10_by_signal
from stone.sources.private_funds import month_back
from stone.sources.gemini import MODEL as GEMINI_MODEL
from stone.sources.gemini import IMAGE_TYPES, GeminiClient, ScreenshotUnreadable, first_sentences
from stone.sources.gemini import connected as gemini_connected
from stone.sources.ollama import OllamaClient
from stone.sources import census
from stone.sources.fhfa import SOURCE as HPI_SOURCE
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


def named(ticker: str, legal: str | None) -> dict:
    """The clean display name plus the name exactly as SEC or the issuer's file prints it."""
    return {"name": display_name(ticker, legal), "legal_name": legal}


def company_or_404(c: psycopg.Connection, ticker: str) -> dict:
    row = c.execute("select * from companies where ticker = %s", (ticker.upper(),)).fetchone()
    if not row:
        raise HTTPException(404, f"No data for {ticker.upper()}")
    return row


def signal_results(c: psycopg.Connection, sym: str, kind: str, market_symbol: str,
                   rates: list | None = None, market: list | None = None) -> list[engine.Result] | None:
    """A stock's own signals; for the market fund (SPY), and funds on the same index (VOO, IVV, SPYM),
    the rate-jump test run on the market itself; None for a fund we never tested (no state, never CALM)."""
    if kind == "stock":
        return list(service.run_all(c, sym, rates, market).values())
    if sym == market_symbol or HOLDINGS_FROM.get(sym) == market_symbol:
        return [service.run_market_rates(c)[1]]
    return None


def same_index_note(etf: str, src: str, source: str | None) -> str | None:
    if src == etf:
        return None
    return (f"Tracks the same index as {src}; holdings from {src}" + (", State Street" if source == "ssga" else "")
            + f". Same index as {src}, so {src}'s test applies.")


def holdings_src(c: psycopg.Connection, etf: str) -> str:
    """Whose holdings a fund uses: its own when loaded (VOO / IVV from their N-PORT), otherwise the fund on the same
    index we do have (SPY's State Street file), otherwise itself."""
    own = c.execute("select exists (select 1 from etf_holdings where etf = %s) as e", (etf,)).fetchone()["e"]
    return etf if own else HOLDINGS_FROM.get(etf, etf)


def nport_note(as_of, source: str | None) -> str | None:
    """Holdings from an SEC N-PORT filing are months old; say so next to them."""
    if not (source or "").startswith("SEC N-PORT"):
        return None
    return (f"Holdings as of {as_of.isoformat()}, from the fund's SEC N-PORT filing. N-PORT is published "
            "about two months after that date, so these are older than a daily issuer file.")


def state_of(results: list[engine.Result] | None) -> str | None:
    return engine.holding_state(results) if results is not None else None


@app.get("/api/status")
def status(c: psycopg.Connection = Conn):
    counts = {r["source"]: r["n"] for r in c.execute(
        "select source, count(*) as n from companies group by source").fetchall()}
    real = sum(n for s, n in counts.items() if s != "sample")
    data = "empty" if not counts else "sample" if not real else "mixed" if "sample" in counts else "real"
    gemini = gemini_connected(config.load())
    # summaries / screenshots: false means those endpoints answer 503, so pages can skip calling them
    return {"data": data, "companies_by_source": counts, "summaries": gemini, "screenshots": gemini}


@app.get("/api/companies")
def companies(c: psycopg.Connection = Conn):
    out = []
    for row in c.execute("select ticker, name, sector, kind, source from companies order by ticker").fetchall():
        last, change = last_two_closes(c, row["ticker"])
        out.append({**row, **named(row["ticker"], row["name"]), "last_close": float(last["close"]) if last else None,
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
        """select i.accepted_at, i.owner_name, i.owner_title, i.transaction_date, i.shares, i.price, i.accession, i.seq,
                  f.primary_doc, f.source from insider_trades i left join filings f on f.accession = i.accession
           where i.ticker = %s and i.code = 'S' order by i.accepted_at desc, i.seq limit 15""", (t,)).fetchall()
    rate = c.execute("select day, value from rates where series = 'DGS10' order by day desc limit 1").fetchone()
    results = signal_results(c, t, co["kind"], service.load_market(c)[0])
    return {
        "company": {**co, **named(t, co["name"])},
        "last": {"close": float(last["close"]), "day": last["day"].isoformat(), "change": change} if last else None,
        "prices": [{"day": p["day"].isoformat(), "open": float(p["open"]), "high": float(p["high"]),
                    "low": float(p["low"]), "close": float(p["close"])} for p in prices],
        "filings": [{**f, "filed_date": f["filed_date"].isoformat(), "accepted_at": f["accepted_at"].isoformat(),
                     "report_date": f["report_date"].isoformat() if f["report_date"] else None,
                     "url": filing_url(co["cik"], f["accession"], f["primary_doc"], f["source"])} for f in filings],
        "insider_sales": [{**{k: v for k, v in s.items() if k not in ("primary_doc", "source")},
                           "accepted_at": s["accepted_at"].isoformat(),
                           "transaction_date": s["transaction_date"].isoformat() if s["transaction_date"] else None,
                           "shares": float(s["shares"]) if s["shares"] is not None else None,
                           "price": float(s["price"]) if s["price"] is not None else None,
                           "url": filing_url(co["cik"], s["accession"], s["primary_doc"], s["source"] or "")}
                          for s in sales],
        "facts": latest_facts(c, t),
        "rate": {"day": rate["day"].isoformat(), "value": float(rate["value"])} if rate else None,
        "signals": [result_json(r, fdr10=fdr10_by_signal(c, t)) for r in results or []],
        "state": state_of(results),
        "days": extreme_days(c, co, prices),
    }


EXTREME_DAYS = 3  # the biggest daily falls and rises shown
DAY_WINDOW = 5  # trading days up to and including a move's close, for what was known then


def extreme_days(c: psycopg.Connection, co: dict, prices: list[dict]) -> dict:
    """The biggest daily falls and rises in the price history we hold, each a close against the one before, with
    what was filed, sold by insiders or moved in rates in the 5 trading days up to that close. Facts only: it
    never says an event caused the move."""
    closes = [(p["day"], float(p["close"])) for p in prices]
    moves = [(c1 / c0 - 1, i) for i, ((_, c0), (_, c1)) in enumerate(zip(closes, closes[1:]), start=1) if c0]
    jumps = engine.detect_rate_jumps(service.load_rates(c)) if moves else []

    def one(change: float, i: int) -> dict:
        start = datetime.combine(closes[max(0, i - (DAY_WINDOW - 1))][0], time(0), tzinfo=engine.EASTERN)
        end = datetime.combine(closes[i][0], time(16), tzinfo=engine.EASTERN)  # the close: known before it, not after
        filed = c.execute("""select form, accepted_at, accession, primary_doc, source from filings
                             where ticker = %s and form <> '4' and accepted_at between %s and %s
                             order by accepted_at""", (co["ticker"], start, end)).fetchall()
        sold = c.execute("""select i.accession, min(i.accepted_at) as accepted_at, min(i.owner_name) as owner_name,
                                   min(i.owner_title) as owner_title, sum(i.shares) as shares,
                                   min(f.primary_doc) as primary_doc, min(f.source) as source
                            from insider_trades i left join filings f on f.accession = i.accession
                            where i.ticker = %s and i.code = 'S' and coalesce(i.acquired_disposed, 'D') = 'D'
                              and i.accepted_at between %s and %s
                            group by i.accession order by accepted_at""", (co["ticker"], start, end)).fetchall()
        events = [{"kind": "filing", "form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
                   "url": filing_url(co["cik"], f["accession"], f["primary_doc"], f["source"])} for f in filed]
        events += [{"kind": "insider_sale", "accession": s["accession"], "accepted_at": s["accepted_at"].isoformat(),
                    "owner_name": s["owner_name"], "owner_title": s["owner_title"],
                    "shares": float(s["shares"]) if s["shares"] is not None else None,
                    "url": filing_url(co["cik"], s["accession"], s["primary_doc"], s["source"] or "")} for s in sold]
        events += [{"kind": "rate_jump", "known_at": e.known_at.isoformat(), "note": e.note}
                   for e in jumps if start <= e.known_at <= end]
        events.sort(key=lambda e: e.get("accepted_at") or e["known_at"])
        return {"day": closes[i][0].isoformat(), "change_pct": change, "close": closes[i][1],
                "prev_close": closes[i - 1][1], "window_start": closes[max(0, i - (DAY_WINDOW - 1))][0].isoformat(),
                "events": events}

    ranked = sorted(moves)
    return {
        "worst": [one(ch, i) for ch, i in ranked[:EXTREME_DAYS]],
        "best": [one(ch, i) for ch, i in ranked[::-1][:EXTREME_DAYS]],
        "window_days": DAY_WINDOW,
        "basis": (f"daily closes, {closes[0][0].isoformat()} to {closes[-1][0].isoformat()}; each day's change is its "
                  "close against the one before" if closes else "daily closes"),
        "source": "Alpaca market data (IEX feed); events from SEC EDGAR and FRED",
    }


RECENT_TRADING_DAYS = 5


def close_change(c: psycopg.Connection, ticker: str, day) -> dict | None:
    """The close on `day` against the close before it; None if there's no bar that day or none before."""
    rows = c.execute("select day, close, source from prices_daily where ticker = %s and day <= %s "
                     "order by day desc limit 2", (ticker, day)).fetchall()
    if len(rows) < 2 or rows[0]["day"] != day:
        return None
    close, prev = float(rows[0]["close"]), float(rows[1]["close"])
    return {"close": close, "prev_close": prev, "prev_day": rows[1]["day"], "change": round(close - prev, 4),
            "change_pct": close / prev - 1, "source": rows[0]["source"]}


def source_json(source: str | None, **extra) -> dict:
    return {"source": source, "name": SOURCE_NAMES.get(source, source), **extra}


@app.get("/api/companies/{ticker}/today")
def company_today(ticker: str, c: psycopg.Connection = Conn):
    """One holding's last trading day and what was filed, sold, moved or fired in its last 5 trading days.
    Facts with their sources only: nothing here says why the price moved."""
    co = company_or_404(c, ticker)
    t = co["ticker"]
    days = [r["day"] for r in c.execute("select day from prices_daily where ticker = %s order by day desc limit %s",
                                        (t, RECENT_TRADING_DAYS)).fetchall()]
    if not days:
        raise HTTPException(404, f"No prices for {t}")
    as_of, start = days[0], days[-1]
    own = close_change(c, t, as_of)
    market_symbol = service.load_market(c)[0]
    market = close_change(c, market_symbol, as_of)  # the market on the same day, not its own latest day
    stock_pct, market_pct = (own or {}).get("change_pct"), (market or {}).get("change_pct")

    filings = c.execute(
        """select form, accepted_at, accession, primary_doc, source from filings
           where ticker = %s and form <> '4' and (accepted_at at time zone 'America/New_York')::date >= %s
           order by accepted_at desc""", (t, start)).fetchall()
    insider_loaded = service.insider_loaded(c, t)
    sales = c.execute(
        """select i.accepted_at, i.owner_name, i.owner_title, i.transaction_date, i.shares, i.price, i.accession,
                  i.source, f.primary_doc from insider_trades i left join filings f on f.accession = i.accession
           where i.ticker = %s and i.code = 'S' and coalesce(i.acquired_disposed, 'D') = 'D'
             and (i.accepted_at at time zone 'America/New_York')::date >= %s
           order by i.accepted_at desc, i.seq""", (t, start)).fetchall() if insider_loaded else []

    base = c.execute("select day, value from rates where series = 'DGS10' and day < %s order by day desc limit 1",
                     (start,)).fetchone()
    latest = c.execute("select day, value, source from rates where series = 'DGS10' order by day desc limit 1").fetchone()
    jumps = [e for e in engine.detect_rate_jumps(service.load_rates(c)) if e.known_at.date() >= start]

    results = signal_results(c, t, co["kind"], market_symbol) or []
    fdr10 = fdr10_by_signal(c, t)
    firing = [{"signal": r.signal, "lite": engine.ALL_SPECS[r.signal].lite, "label": r.label,
               "known_at": r.firing.known_at.isoformat(), "note": r.firing.note,
               "in_window": r.firing.known_at.astimezone(engine.EASTERN).date() >= start,
               "fdr10_survives": fdr10.get(r.signal)} for r in results if r.firing]
    scan_row = c.execute("select run_at from signal_scans order by run_at desc limit 1").fetchone()
    filing_sources = sorted({f["source"] for f in filings} | {s["source"] for s in sales}) or ["sec"]

    return {
        "ticker": t, **named(t, co["name"]), "as_of": as_of.isoformat(),
        "close": own["close"] if own else None, "prev_close": own["prev_close"] if own else None,
        "day_change": own["change"] if own else None,  # dollars per share
        "day_change_pct": stock_pct,  # a fraction, like every other change here: 0.012 = +1.2%
        "market_symbol": market_symbol,  # "SPY" on real data
        "spy_change_pct": market_pct,  # the market's change on the same day, a fraction
        "vs_market": vs_market_words(stock_pct, market_pct),  # size of the move only; see same_direction
        "same_direction": (stock_pct >= 0) == (market_pct >= 0) if own and market else None,
        "window": {"start": start.isoformat(), "end": as_of.isoformat(), "trading_days": len(days),
                   "note": "Filings and insider sales from the start date on, including any after the last close."},
        "events": {
            "filings": [{"form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
                         "url": filing_url(co["cik"], f["accession"], f["primary_doc"], f["source"])} for f in filings],
            # None, not []: Form 4s aren't loaded for this stock, so "no sales" would be a guess
            "insider_sales": [{"accepted_at": s["accepted_at"].isoformat(), "owner_name": s["owner_name"],
                               "owner_title": s["owner_title"],
                               "transaction_date": s["transaction_date"].isoformat() if s["transaction_date"] else None,
                               "shares": float(s["shares"]) if s["shares"] is not None else None,
                               "price": float(s["price"]) if s["price"] is not None else None,
                               "url": filing_url(co["cik"], s["accession"], s["primary_doc"], s["source"])}
                              for s in sales] if insider_loaded else None,
            # the 10-year yield's latest reading against the last reading before the window
            "rate_move": {"series": "DGS10", "from_day": base["day"].isoformat(), "from_value": float(base["value"]),
                          "to_day": latest["day"].isoformat(), "to_value": float(latest["value"]),
                          "change": round(float(latest["value"] - base["value"]), 4),
                          "known_at": engine.rate_known_at(latest["day"]).isoformat(),
                          "jumps": [{"known_at": e.known_at.isoformat(), "note": e.note} for e in jumps]}
                         if base and latest else None,
            "signals_firing": firing,  # every signal firing now; in_window = it became known inside the window
        },
        "sources": {
            "prices": source_json(own["source"] if own else None, as_of=as_of.isoformat()),
            "market": source_json(market["source"] if market else None, symbol=market_symbol),
            "filings": [source_json(s) for s in filing_sources],
            "rate": source_json(latest["source"], series="DGS10", as_of=latest["day"].isoformat()) if latest else None,
            "signals": {"source": "stone", "name": "Precedence signal engine (prices, SEC, FRED)",
                        "scan_run_at": scan_row["run_at"].isoformat() if scan_row else None},
        },
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
                    "items": firing, "as_of": out["day"], "source": "Precedence signal engine (prices, SEC, FRED)"},
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


PRIVATE_SOURCE = {"424B3": "SEC EDGAR: {t} monthly 424B3 NAV supplements", "8-K": "SEC EDGAR: {t} monthly 8-K (Item 8.01)"}


def private_fund_or_none(c: psycopg.Connection, symbol: str) -> dict | None:
    return c.execute("select * from private_funds where ticker = %s", (symbol.strip().upper(),)).fetchone()


def private_navs(c: psycopg.Connection, f: dict) -> list[dict]:
    return c.execute("select as_of, nav, form, accession, url from private_fund_navs "
                     "where ticker = %s and share_class = %s order by as_of", (f["ticker"], f["share_class"])).fetchall()


def nav_return(by_month: dict, latest, months: int) -> float | None:
    """Latest month-end NAV against the one `months` month ends earlier; None if that month has no filed NAV."""
    then = by_month.get(month_back(latest, months))
    return by_month[latest] / then - 1 if then else None


def total_return(by_month: dict, paid: dict, latest, months: int) -> float | None:
    """(NAV at the end + distributions whose record date falls in the window) / NAV at the start - 1, not
    reinvested. None if either NAV or any month's distribution in the window has no filing."""
    start = month_back(latest, months)
    window = [month_back(latest, k) for k in range(months)]  # the month ends after `start`, up to `latest`
    if start not in by_month or any(m not in paid for m in window):
        return None
    return (by_month[latest] + sum(paid[m] for m in window)) / by_month[start] - 1


def private_fund_page(c: psycopg.Connection, f: dict) -> dict:
    navs = private_navs(c, f)
    last = navs[-1] if navs else None
    by_month = {n["as_of"]: float(n["nav"]) for n in navs}
    dists = c.execute("select month, amount, record_date, url from private_fund_distributions "
                      "where ticker = %s and share_class = %s order by month", (f["ticker"], f["share_class"])).fetchall()
    paid = {d["month"]: float(d["amount"]) for d in dists}
    links = c.execute("select form, accepted_at, url from private_fund_filings where ticker = %s "
                      "order by accepted_at desc", (f["ticker"],)).fetchall()
    return {
        "kind": "private_fund", "symbol": f["ticker"], "name": f["name"], "sponsor": "Blackstone",
        "pricing": "monthly NAV",
        "nav": {"value": float(last["nav"]), "as_of": last["as_of"].isoformat(), "share_class": f["share_class"],
                "form": last["form"], "accession": last["accession"], "url": last["url"]} if last else None,
        "history": [{"as_of": n["as_of"].isoformat(), "nav": float(n["nav"]), "url": n["url"]} for n in navs],
        "returns": {**{k: nav_return(by_month, last["as_of"], m) if last else None
                       for k, m in (("m1", 1), ("m3", 3), ("m12", 12))},
                    "basis": f"monthly NAV, class {f['share_class']}, distributions not included"},
        "distributions": [{"month": d["month"].isoformat(), "amount": float(d["amount"]),
                           "record_date": d["record_date"].isoformat(), "url": d["url"]} for d in dists],
        "total_return": {**{k: total_return(by_month, paid, last["as_of"], m) if last else None
                            for k, m in (("m1", 1), ("m3", 3), ("m12", 12))},
                         "basis": f"NAV change plus distributions paid, not reinvested, Class {f['share_class']}"},
        "invests_in": {"text": f["invests_in"], "url": f["invests_in_url"]} if f["invests_in"] else None,
        "liquidity_note": f["liquidity_note"], "liquidity_url": f["liquidity_url"],
        "filings": [{"form": x["form"], "accepted_at": x["accepted_at"].isoformat(), "url": x["url"]} for x in links],
        "holdings": [], "state": None,
        "source": PRIVATE_SOURCE[f["nav_form"]].format(t=f["ticker"]),
    }


def private_fund_row(c: psycopg.Connection, fund: str | None, amount: float | None) -> dict:
    """A BREIT/BCRED holding: worth the amount entered. The NAV only gives Pro a share count."""
    f = private_fund_or_none(c, fund or "")
    if f is None:
        raise HTTPException(422, f"Unknown private fund {fund!r}. Precedence has BREIT and BCRED.")
    if not amount or amount <= 0:
        raise HTTPException(422, "A private fund row needs the amount you hold.")
    navs = private_navs(c, f)
    last = navs[-1] if navs else None
    nav = float(last["nav"]) if last else None
    return {"kind": "private_fund", "fund": f["ticker"], "name": f["name"], "amount": amount, "nav": nav,
            "nav_as_of": last["as_of"].isoformat() if last else None, "nav_url": last["url"] if last else None,
            "share_class": f["share_class"], "shares": amount / nav if nav else None, "state": None}


@app.get("/api/funds/lookup")  # declared before /api/funds/{symbol} so "lookup" isn't read as a fund
def funds_lookup(q: str):
    """Which index a 401(k) / IRA fund tracks, from a small checked list."""
    return retirement.lookup(q)


@app.get("/api/funds/{symbol}")
def fund(symbol: str, c: psycopg.Connection = Conn):
    """A fund page: what's in it, how it's doing, what's next. Holdings come from the issuer's file.
    BREIT / BCRED (non-traded, monthly NAV) get the private-fund page instead."""
    if (pfund := private_fund_or_none(c, symbol)) is not None:
        return private_fund_page(c, pfund)
    co = company_or_404(c, symbol)
    if co["kind"] != "etf":
        raise HTTPException(400, f"{co['ticker']} is a stock, not a fund")
    t = co["ticker"]
    src = holdings_src(c, t)  # VOO / IVV: their own N-PORT once loaded, else SPY's
    closes = [(r["day"], float(r["close"])) for r in c.execute(
        "select day, close from prices_daily where ticker = %s order by day", (t,)).fetchall()]
    as_of = c.execute("select max(as_of) as d from etf_holdings where etf = %s", (src,)).fetchone()["d"]
    rows = c.execute("select holding, weight, source, name from etf_holdings where etf = %s and as_of = %s "
                     "order by weight desc", (src, as_of)).fetchall() if as_of else []
    tracked = {r["ticker"]: r for r in c.execute(
        "select ticker, name, kind from companies where ticker = any(%s)", ([r["holding"] for r in rows],)).fetchall()}
    market_symbol, market = service.load_market(c)
    rates = service.load_rates(c)
    holdings = []
    for r in rows[:FUND_TOP]:
        k = tracked.get(r["holding"])
        results = signal_results(c, r["holding"], k["kind"], market_symbol, rates, market) if k else None
        holdings.append({"ticker": r["holding"],
                         **named(r["holding"], k["name"] if k else r["name"]),  # untracked: the issuer's name
                         "weight": float(r["weight"]),
                         "in_stone": k is not None, "state": state_of(results),
                         "firing": [{"signal": x.signal, "label": x.label} for x in results or [] if x.firing],
                         "lite_line": lite_line(results)})
    fund_results = signal_results(c, t, co["kind"], market_symbol, rates, market)
    day = c.execute("select max(day) as d from prices_daily").fetchone()["d"]
    start = day - timedelta(days=WEEK_DAYS - 1) if day else None
    top = {h["ticker"] for h in holdings}
    week = [f for f in filed_between(c, start, day) if f["ticker"] in top] if day else []
    return {
        "symbol": t, "name": display_name(t, co["name"]),
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
        "note": f"Holdings for {t} aren't loaded yet." if not rows else nport_note(as_of, rows[0]["source"])
        or same_index_note(t, src, rows[0]["source"]),
    }


@app.get("/api/market/rate_jump")
def market_rate_jump(c: psycopg.Connection = Conn):
    """Rate jumps and the whole market: the plain "was it lower?" test run on SPY itself."""
    symbol, r = service.run_market_rates(c)
    return {"symbol": symbol, **result_json(r)}


@app.get("/api/lab/signals")
def lab_signals():
    return [{"key": s.key, "lite": s.lite, "pro": s.pro, "horizon": s.horizon} for s in service.active_specs().values()]


@app.get("/api/lab/{ticker}/{signal}")
def lab(ticker: str, signal: str, c: psycopg.Connection = Conn):
    co = company_or_404(c, ticker)
    if signal not in service.active_specs():
        raise HTTPException(404, f"Unknown signal {signal}")
    if co["kind"] != "stock":
        raise HTTPException(400, "Signals run on stocks, not funds")
    return result_json(service.run_one(c, co["ticker"], signal), fdr10=fdr10_by_signal(c, co["ticker"]))


class HoldingIn(BaseModel):
    symbol: str
    shares: float


class OtherIn(BaseModel):
    """Something owned outside a brokerage account. The API stays stateless: the browser sends these each time."""
    kind: Literal["retirement", "property", "private_fund"]
    fund: str | None = None  # retirement: the fund as typed; private_fund: "BREIT" | "BCRED"
    amount: float | None = None
    account: str | None = None
    label: str | None = None  # property, carrying the fields from /api/estimate/home
    address: str | None = None
    paid: float | None = None
    bought_year: int | None = None
    estimate: float | None = None
    source: str | None = None
    as_of: str | None = None


class PortfolioIn(BaseModel):
    holdings: list[HoldingIn]
    other: list[OtherIn] = []

    def held(self) -> list[Holding]:
        return [Holding(h.symbol, h.shares) for h in self.holdings]


def fund_weights(c: psycopg.Connection, etf: str, known: dict) -> tuple[dict[str, float], dict]:
    """The fund's latest holdings, only stocks we have data for (the rest stays as the fund itself).
    An ETF tracking the same index as a fund we load (VOO, IVV, SPLG -> SPY) uses that fund's holdings."""
    src = holdings_src(c, etf)
    latest = c.execute("select max(as_of) as d from etf_holdings where etf = %s", (src,)).fetchone()["d"]
    rows_ = c.execute("select holding, weight, source from etf_holdings where etf = %s and as_of = %s",
                      (src, latest)).fetchall()
    weights = {r["holding"]: float(r["weight"]) for r in rows_ if r["holding"] in known}
    source = rows_[0]["source"] if rows_ else None
    return weights, {"symbol": etf, "as_of": latest.isoformat() if latest else None, "source": source,
                     "looked_through": sum(weights.values()), "holdings_from": src if src != etf else None,
                     "note": same_index_note(etf, src, source)}


@app.post("/api/portfolio")
def portfolio(body: PortfolioIn, c: psycopg.Connection = Conn):
    known = {r["ticker"]: r for r in c.execute("select * from companies").fetchall()}
    priced = price_holdings(c, body.held(), known)
    rows = [{"symbol": p.symbol, **named(p.symbol, known[p.symbol]["name"]), "kind": known[p.symbol]["kind"],
             "shares": p.shares, "price": p.price, "value": p.value, "change": p.change,
             "renamed_from": p.renamed_from} for p in priced.holdings]
    values = priced.values  # a fresh dict: 401(k) / IRA funds that stand in for a fund join it below

    investments = priced.total
    etfs = [s for s in values if known[s]["kind"] == "etf"]
    weights: dict[str, dict[str, float]] = {}
    funds = []
    for etf in etfs:
        weights[etf], info = fund_weights(c, etf, known)
        funds.append(info)
    rates = service.load_rates(c)
    market_symbol, market = service.load_market(c)

    # 401(k) / IRA funds: a mapped one joins the board as a fund with its stand-in's holdings (SPY on real
    # data, the sample index fund in sample mode). Only an "exact index" match also takes the stand-in's
    # state; a "close stand-in" holds other companies too, so SPY's test isn't its test. Unmapped: listed only.
    stand_in: dict[str, str] = {}
    same_index: set[str] = set()
    retirement_rows, properties, private_rows = [], [], []
    for o in body.other:
        if o.kind == "private_fund":
            private_rows.append(private_fund_row(c, o.fund, o.amount))
        elif o.kind == "retirement":
            if not o.fund or not o.amount or o.amount <= 0:
                raise HTTPException(422, "A retirement row needs a fund and an amount.")
            f = retirement.find(o.fund)
            row = {"kind": "retirement", "fund": o.fund, "ticker": f.ticker if f else None, "name": f.name if f else None,
                   "account": o.account, "amount": o.amount, "behaves_like": f.behaves_like if f else None,
                   "match": f.match if f else None, "state": None, "note": retirement.lookup(o.fund)["note"]}
            if f and f.behaves_like == "SPY" and market_symbol in known:
                key = f.ticker
                stand_in[key] = market_symbol
                if f.match == "exact index":
                    same_index.add(key)
                known.setdefault(key, {"ticker": key, "name": f.name, "kind": "etf", "sector": None})
                values[key] = values.get(key, 0.0) + o.amount
                if key not in weights:
                    weights[key], _ = fund_weights(c, market_symbol, known)
            retirement_rows.append(row)
        else:
            if o.estimate is None or o.estimate < 0:
                raise HTTPException(422, "A property row needs an estimate (from /api/estimate/home).")
            properties.append({"kind": "property", "label": o.label or o.address or "Home", "paid": o.paid,
                               "bought_year": o.bought_year, "estimate": o.estimate, "source": o.source,
                               "as_of": o.as_of, "state": None})
    total = sum(values.values())

    exposure = []
    for sym, row in board_rows(values, weights).items():
        tested = stand_in.get(sym, sym)  # a mapped 401(k) fund borrows its stand-in's prices
        bars = service.load_bars(c, tested)
        bad = bad_day_return([b.close for b in bars])
        results = (None if sym in stand_in and sym not in same_index  # close stand-in: not tested
                   else signal_results(c, tested, known[tested]["kind"], market_symbol, rates, market))
        exposure.append({
            "symbol": sym, **named(sym, known[sym]["name"]), "sector": known[sym]["sector"],
            "direct": row.direct, "via_etf": row.via_etf, "total": row.shown,
            "share_of_total": row.shown / total if total else None,
            "bad_day_return": bad, "bad_day_loss": bad * row.shown if bad is not None else None,
            "state": state_of(results),
            "firing": [result_json(r, with_cases=False, fdr10=fdr10_by_signal(c, tested))
                       for r in results or [] if r.firing],
            "children": [{"symbol": k, "name": display_name(k, known[k]["name"]), "total": v}
                         for k, v in sorted(row.children.items(), key=lambda kv: -kv[1])],
        })
    exposure.sort(key=lambda e: (e["state"] != engine.WATCH, -e["total"]))
    by_symbol = {e["symbol"]: e for e in exposure}
    for r in retirement_rows:
        if r["ticker"] in same_index:
            r["state"] = by_symbol[r["ticker"]]["state"] if r["ticker"] in by_symbol else None
            r["note"] = f"Same index as {r['behaves_like']}, so {r['behaves_like']}'s test applies."
    price_as_of = priced.price_as_of  # the close the values are priced at
    retirement_total = sum(r["amount"] for r in retirement_rows)
    home_estimate = sum(p["estimate"] for p in properties)
    private_total = sum(r["amount"] for r in private_rows)
    return {"total": total, "rows": rows, "exposure": exposure, "unknown": priced.unknown, "funds": funds,
            "price_as_of": price_as_of.isoformat() if price_as_of else None,
            "retirement": retirement_rows, "properties": properties, "private_funds": private_rows,
            "subtotals": {"investments": investments, "retirement": retirement_total, "home_estimate": home_estimate,
                          "private_funds": private_total,
                          "total": investments + retirement_total + home_estimate + private_total,
                          "includes_home_estimate": home_estimate > 0}}


class HomeIn(BaseModel):
    address: str | None = None  # a full street address, geocoded by the Census
    zip: str | None = None  # or just a 5-digit ZIP (no geocoding, so no county/state fallback)
    paid: float
    bought_year: int
    bought_month: int | None = None


def geocode_address(address: str) -> census.Geocode | None:
    """Kept separate so tests can stand in for the Census."""
    return census.CensusGeocoder(config.load()).geocode(address)


@app.post("/api/estimate/home")
def estimate_home(body: HomeIn, c: psycopg.Connection = Conn):
    """What you paid × how much the FHFA house price index moved since. An estimate, not an appraisal."""
    if body.paid <= 0:
        raise HTTPException(422, "Enter what you paid for the home.")
    matched = county = us_state = lat = lon = None  # ZIP only: no point to place on a map
    if body.address and body.address.strip():
        try:
            g = geocode_address(body.address.strip())
        except httpx.HTTPError as e:
            raise HTTPException(502, f"The Census geocoder didn't answer ({e.__class__.__name__}). Try just the ZIP code.")
        if g is None or not g.zip:
            raise HTTPException(422, "The Census geocoder couldn't match that address. "
                                     "Try the full street address with city and state, or just the ZIP code.")
        located_by, matched, zip5, county, us_state = "address", g.matched, g.zip, g.county_fips, g.state
        lat, lon = g.lat, g.lon  # where the Census geocoder placed the match
    elif body.zip:
        zip5 = body.zip.strip()
        if not (len(zip5) == 5 and zip5.isdigit()):
            raise HTTPException(422, "A ZIP code has 5 digits.")
        located_by = "zip"
    else:
        raise HTTPException(422, "Give a street address or a 5-digit ZIP code.")
    series: dict[str, dict[int, float]] = {}
    for level, area in (("zip5", zip5), ("county", county), ("state", us_state)):
        if area:
            series[level] = {r["year"]: float(r["hpi"]) for r in c.execute(
                "select year, hpi from house_price_index where level = %s and area = %s", (level, area)).fetchall()}
    e = homes.estimate(body.paid, body.bought_year, series)
    if e["estimate"] is None:
        raise HTTPException(422, e["note"])
    level = e["index_level"] or "zip5"
    note = e["note"]
    if body.bought_month and e["index_level"]:
        note = " ".join(filter(None, [note, "The index is yearly, so the purchase month isn't used."]))
    return {
        "kind": "property", "located_by": located_by, "address": body.address, "address_matched": matched,
        "zip": zip5, "county_fips": county, "us_state": us_state, **e, "note": note,
        "method": homes.METHOD if level == "zip5" else f"paid × FHFA {homes.LEVEL_WORDS[level]} index change",
        "source": HPI_SOURCE[level], "geocoder": census.NAME if located_by == "address" else None, "state": None,
        "lat": lat, "lon": lon,
    }


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
    priced = price_holdings(c, body.held(), known)
    values = priced.values
    market_symbol, _ = service.load_market(c)
    closes = {s: [(b.day, b.close) for b in service.load_bars(c, s)] for s in {*values, market_symbol}}
    got = portfolio_risk(closes, values, market_symbol)
    if got is None:
        raise HTTPException(422, "Not enough shared price history for these holdings.")
    mine, market, rets = got
    total = priced.total
    return {
        "total": total, "symbols": sorted(values), "unknown": priced.unknown, "market_symbol": market_symbol,
        "start": rets.index.min().date().isoformat(), "end": rets.index.max().date().isoformat(), "days": len(rets),
        "portfolio": risk_json(mine, total), "market": risk_json(market),
        "basis": RISK_BASIS, "source": "QuantStats on Precedence's daily closes (Alpaca, IEX feed)",
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


def gemini_failed(e: httpx.HTTPError, instead: str = "") -> HTTPException:
    """Gemini's HTTP failures in plain words. `instead`: what the person can do meanwhile."""
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429:
        return HTTPException(503, f"Gemini is busy, or this key's free quota is used up for now (HTTP 429). "
                                  f"Try again in a minute.{instead}")
    if isinstance(e, httpx.HTTPStatusError):
        return HTTPException(502, f"Gemini returned HTTP {e.response.status_code} (model {GEMINI_MODEL}).{instead}")
    return HTTPException(504, f"Gemini didn't answer in time.{instead}")


def summarizer(settings: config.Settings) -> "GeminiClient | OllamaClient":
    """Which model writes filing summaries: Ollama when STONE_SUMMARY_MODEL is "ollama:<model>"
    (docs/v2-plan.md, milestone M3), else Gemini. Either way every figure is checked against XBRL."""
    choice = os.getenv("STONE_SUMMARY_MODEL", "")
    if choice.startswith("ollama:"):
        return OllamaClient(settings, choice.split(":", 1)[1], os.getenv("OLLAMA_URL"))
    try:
        return GeminiClient(settings)
    except NotConnected:
        raise HTTPException(503, "Filing summaries aren't connected yet (GEMINI_API_KEY is not set).")


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
    client = summarizer(config.load())
    text = filing_text(f["cik"], accession, f["primary_doc"], f["source"])
    try:
        read, cached, generated = client.summarize_filing(text, f["ticker"], f["form"], accession)
    except ScreenshotUnreadable as e:
        raise HTTPException(422, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"The local model ({client.model_name}, Ollama) didn't answer: {e}") \
            if isinstance(client, OllamaClient) else gemini_failed(e)
    facts = c.execute("select concept, value, period_end from xbrl_facts where accession = %s and taxonomy = 'us-gaap'",
                      (accession,)).fetchall()
    return {
        "accession": accession, "ticker": f["ticker"], "form": f["form"], "accepted_at": f["accepted_at"].isoformat(),
        "url": filing_url(f["cik"], accession, f["primary_doc"], f["source"]),
        "summary_lite": first_sentences(read.summary, 3),
        "figures": check_figures(read.figures, facts),
        "model": getattr(client, "model_name", GEMINI_MODEL), "generated_at": generated.isoformat(), "cached": cached,
    }


MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024  # Gemini takes inline images up to ~20 MB per request


@app.post("/api/import/screenshot")
async def import_screenshot(file: UploadFile = File(...)):
    if file.content_type not in IMAGE_TYPES:
        raise HTTPException(415, "Add the screenshot as a PNG, JPEG, WebP or HEIC image.")
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
    except httpx.HTTPError as e:
        raise gemini_failed(e, " You can type the rows instead.")
    rows = [rc.Row(r.symbol, r.shares, r.price, r.value) for r in read.rows]
    return reconciled_json(rc.reconcile(rows, read.printed_total), rows)


@app.get("/api/briefing/{ticker}")
def briefing_company(ticker: str, c: psycopg.Connection = Conn):
    """The spoken briefing for one holding: the expert panel's lines, every number checked against its evidence."""
    return briefing_json(company_briefing(company(ticker, c)))


@app.post("/api/briefing/portfolio")
def briefing_portfolio(body: PortfolioIn, c: psycopg.Connection = Conn):
    """The spoken briefing for a whole portfolio, from the same responses the board, risk card and company pages use."""
    board = portfolio(body, c)
    try:
        risk = portfolio_risk_card(body, c)
    except HTTPException:
        risk = None  # too little shared history: the risk expert just has nothing to say
    companies = {r["symbol"]: company(r["symbol"], c) for r in board["rows"]}
    return briefing_json(portfolio_briefing(board, companies, market_rate_jump(c), risk, holdings_key(body.held())))
