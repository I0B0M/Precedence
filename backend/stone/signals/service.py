"""Loads what the engine needs from Postgres and runs every signal for a ticker."""

from datetime import datetime

import psycopg

from stone.signals import engine
from stone.sources.prices import Bar

# The whole market, for signals judged against it: SPY on real data, the sample's index fund in sample mode.
MARKET_TICKERS = ("SPY", "BRD500")


class NoMarketData(LookupError):
    """No market prices loaded, so a market-relative signal can't be measured."""


def load_bars(conn: psycopg.Connection, ticker: str) -> list[Bar]:
    rows = conn.execute(
        "select day, open, high, low, close, volume from prices_daily where ticker = %s order by day",
        (ticker,)).fetchall()
    return [Bar(r["day"], float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]),
                float(r["volume"]) if r["volume"] is not None else None) for r in rows]


def load_market(conn: psycopg.Connection) -> tuple[str, list[Bar]]:
    for t in MARKET_TICKERS:
        bars = load_bars(conn, t)
        if bars:
            return t, bars
    raise NoMarketData(f"No market prices loaded ({' or '.join(MARKET_TICKERS)}), "
                       "so the rate-jump signal can't be compared to the market.")


def load_rates(conn: psycopg.Connection, series: str = "DGS10") -> list[tuple]:
    rows = conn.execute("select day, value from rates where series = %s order by day", (series,)).fetchall()
    return [(r["day"], float(r["value"])) for r in rows]


def load_sales(conn: psycopg.Connection, ticker: str) -> list[tuple[str, datetime]]:
    """Form 4 filings with at least one open-market sale (code S, shares disposed)."""
    rows = conn.execute(
        """select accession, min(accepted_at) as accepted_at from insider_trades
           where ticker = %s and code = 'S' and coalesce(acquired_disposed, 'D') = 'D'
           group by accession""", (ticker,)).fetchall()
    return [(r["accession"], r["accepted_at"]) for r in rows]


def events_for(spec_key: str, bars: list[Bar], rates: list[tuple], sales: list) -> list[engine.Event]:
    if spec_key == engine.INSIDER.key:
        return engine.detect_insider_clusters(sales)
    if spec_key == engine.RATES.key:
        return engine.detect_rate_jumps(rates)
    if spec_key == engine.GAP.key:
        return engine.detect_gap_downs(bars)
    raise KeyError(spec_key)


def run_all(conn: psycopg.Connection, ticker: str, rates: list[tuple] | None = None,
            market: list[Bar] | None = None) -> dict[str, engine.Result]:
    bars = load_bars(conn, ticker)
    rates = load_rates(conn) if rates is None else rates
    market = load_market(conn)[1] if market is None else market
    sales = load_sales(conn, ticker)
    return {key: engine.test_signal(spec, bars, events_for(key, bars, rates, sales), market)
            for key, spec in engine.SPECS.items()}


def run_one(conn: psycopg.Connection, ticker: str, spec_key: str) -> engine.Result:
    bars = load_bars(conn, ticker)
    spec = engine.SPECS[spec_key]
    market = load_market(conn)[1] if spec.vs_market else None
    return engine.test_signal(spec, bars, events_for(spec_key, bars, load_rates(conn), load_sales(conn, ticker)),
                              market)


def run_market_rates(conn: psycopg.Connection) -> tuple[str, engine.Result]:
    """The rate-jump test on the market itself: was SPY lower afterwards?"""
    symbol, market = load_market(conn)
    return symbol, engine.test_signal(engine.MARKET_RATES, market, engine.detect_rate_jumps(load_rates(conn)))
