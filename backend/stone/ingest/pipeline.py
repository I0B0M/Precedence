"""Real ingest: SEC + Massive + FRED into Postgres, for the tickers in tickers.py.

Each source runs only if its key is set; a missing key skips that source with a
message instead of failing the whole run. With offline=True nothing leaves the
machine: everything is rebuilt from data/cache/.
"""

from datetime import date, timedelta

import psycopg

from stone.config import NotConnected, Settings
from stone.ingest import store
from stone.ingest.tickers import STOCKS, TICKERS
from stone.sources.fred import FredClient
from stone.sources.prices import MassiveClient
from stone.sources.sec import SecClient

YEARS_BACK = 2


def check_ciks(sec: SecClient) -> None:
    live = sec.ticker_map()
    wrong = [(t.symbol, t.cik, live.get(t.symbol)) for t in STOCKS if live.get(t.symbol) != t.cik]
    if wrong:
        raise ValueError(f"CIKs in tickers.py disagree with SEC: {wrong}")


def ingest_sec(conn: psycopg.Connection, sec: SecClient, since: date, log=print) -> None:
    for t in STOCKS:
        filings = sec.filings(t.cik, since)
        store.upsert_filings(conn, t.symbol, filings, "sec")
        store.upsert_facts(conn, t.symbol, sec.companyfacts(t.cik), "sec")
        form4s = [f for f in filings if f.form == "4"]
        failed = 0
        for f in form4s:
            try:
                store.upsert_trades(conn, t.symbol, f.accession, f.accepted_at, sec.form4(t.cik, f), "sec")
            except Exception as e:  # one bad Form 4 must not stop the run
                failed += 1
                log(f"  {t.symbol} Form 4 {f.accession}: {e}")
        conn.commit()
        log(f"{t.symbol}: {len(filings)} filings, {len(form4s)} Form 4s ({failed} failed)")


def ingest_prices(conn: psycopg.Connection, massive: MassiveClient, since: date, today: date, log=print) -> None:
    for t in TICKERS:
        bars = massive.daily(t.symbol, since, today)
        store.upsert_bars(conn, t.symbol, bars, "massive")
        conn.commit()
        log(f"{t.symbol}: {len(bars)} price days")


def ingest_rates(conn: psycopg.Connection, fred: FredClient, since: date, log=print) -> None:
    obs = fred.series("DGS10", since)
    store.upsert_rates(conn, "DGS10", obs, "fred")
    conn.commit()
    log(f"DGS10: {len(obs)} days")


def run(conn: psycopg.Connection, settings: Settings, today: date, offline: bool = False, log=print) -> None:
    since = today - timedelta(days=365 * YEARS_BACK + 40)  # a little extra so 2y of signals have history
    for t in TICKERS:
        store.upsert_company(conn, t.symbol, t.cik, t.name, t.sector, t.kind, "sec" if t.cik else "massive")
    conn.commit()

    try:
        sec = SecClient(settings, offline)
        if not offline:
            check_ciks(sec)
        ingest_sec(conn, sec, since, log)
    except NotConnected as e:
        log(f"SKIPPED SEC: {e}")

    try:
        ingest_prices(conn, MassiveClient(settings, offline), since, today, log)
    except NotConnected as e:
        log(f"SKIPPED Massive prices: {e}")

    try:
        ingest_rates(conn, FredClient(settings, offline), since, log)
    except NotConnected as e:
        log(f"SKIPPED FRED DGS10: {e}")
