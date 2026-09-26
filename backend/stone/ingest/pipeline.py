"""Real ingest: SEC + Alpaca prices + FRED into Postgres, for the tickers in tickers.py.

Each source runs only if its key is set; a missing key skips that source with a
message instead of failing the whole run. With offline=True nothing leaves the
machine: everything is rebuilt from data/cache/.
"""

from dataclasses import replace
from datetime import date, timedelta

import psycopg

from stone.config import NotConnected, Settings
from stone.ingest import store
from stone.ingest.tickers import TICKERS, Ticker
from stone.sources.fred import FredClient
from stone.sources.prices import AlpacaPrices
from stone.sources.sec import SecClient

YEARS_BACK = 2


def resolve(sec: SecClient, stocks: list[Ticker], log=print) -> list[Ticker]:
    """Fill in CIK and name from SEC for tickers listed without one; check the hand-entered ones."""
    live = sec.ticker_map()
    wrong = [(t.symbol, t.cik, live.get(t.symbol, (None,))[0]) for t in stocks
             if t.cik and live.get(t.sec_symbol or t.symbol, (None,))[0] not in (t.cik, *t.also_ciks)]
    if wrong:
        raise ValueError(f"CIKs in tickers.py disagree with SEC: {wrong}")
    out, missing = [], []
    for t in stocks:
        if t.cik:
            out.append(t)
        elif (t.sec_symbol or t.symbol) in live:
            cik, title = live[t.sec_symbol or t.symbol]
            out.append(replace(t, cik=cik, name=title.title() if title.isupper() else title))
        else:
            missing.append(t.symbol)
    if missing:
        log(f"NOT LOADED, not in SEC's ticker list: {', '.join(missing)}")
    return out


FACT_FORMS = {"10-K", "10-Q", "10-K/A", "10-Q/A"}


def ingest_sec(conn: psycopg.Connection, sec: SecClient, since: date, stocks: list[Ticker], log=print) -> None:
    for t in stocks:
        store.upsert_company(conn, t.symbol, t.cik, t.name, t.sector, t.kind, "sec")
        by_cik = {cik: sec.filings(cik, since) for cik in (t.cik, *t.also_ciks)}
        filings = [f for fs in by_cik.values() for f in fs]
        store.upsert_filings(conn, t.symbol, filings, "sec")
        facts = [f for cik in by_cik for f in sec.companyfacts(cik) if f.form in FACT_FORMS and f.filed and f.filed >= since]
        store.upsert_facts(conn, t.symbol, facts, "sec")
        form4s = [(cik, f) for cik, fs in by_cik.items() for f in fs if f.form == "4"] if t.form4 else []
        failed = 0
        for cik, f in form4s:
            try:
                store.upsert_trades(conn, t.symbol, f.accession, f.accepted_at, sec.form4(cik, f), "sec")
            except Exception as e:  # one bad Form 4 must not stop the run
                failed += 1
                log(f"  {t.symbol} Form 4 {f.accession}: {e}")
        conn.commit()
        log(f"{t.symbol}: {len(filings)} filings, {len(facts)} XBRL facts, "
            + (f"{len(form4s)} Form 4s ({failed} failed)" if t.form4 else "Form 4s not loaded"))


def ingest_prices(conn: psycopg.Connection, alpaca: AlpacaPrices, tickers: list, since: date, today: date,
                  log=print) -> None:
    symbols = [t.symbol for t in tickers]
    for i in range(0, len(symbols), 25):
        batch = alpaca.daily(symbols[i:i + 25], since, today)
        for sym, bars in batch.items():
            store.upsert_bars(conn, sym, bars, "alpaca-iex")
            log(f"{sym}: {len(bars)} price days")
        conn.commit()


def ingest_rates(conn: psycopg.Connection, fred: FredClient, since: date, log=print) -> None:
    obs = fred.series("DGS10", since)
    store.upsert_rates(conn, "DGS10", obs, "fred")
    conn.commit()
    log(f"DGS10: {len(obs)} days")


def run(conn: psycopg.Connection, settings: Settings, today: date, offline: bool = False,
        only: set[str] | None = None, log=print) -> None:
    since = today - timedelta(days=365 * YEARS_BACK + 40)  # a little extra so 2y of signals have history
    tickers = [t for t in TICKERS if not only or t.symbol in only]
    stocks = [t for t in tickers if t.kind == "stock"]
    for t in tickers:
        if t.kind == "etf":
            store.upsert_company(conn, t.symbol, None, t.name, t.sector, t.kind, "alpaca-iex")
    conn.commit()

    try:
        sec = SecClient(settings, offline)
        ingest_sec(conn, sec, since, resolve(sec, stocks, log), log)
    except NotConnected as e:
        log(f"SKIPPED SEC: {e}")
        return  # prices need the company rows SEC creates

    try:
        ingest_prices(conn, AlpacaPrices(settings, offline), tickers, since, today, log)
    except NotConnected as e:
        log(f"SKIPPED Alpaca prices: {e}")

    try:
        ingest_rates(conn, FredClient(settings, offline), since, log)
    except NotConnected as e:
        log(f"SKIPPED FRED DGS10: {e}")
