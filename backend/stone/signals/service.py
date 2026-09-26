"""Loads what the engine needs from Postgres and runs every signal for a ticker."""

from datetime import datetime

import psycopg

from stone.signals import engine
from stone.sources.prices import Bar


def load_bars(conn: psycopg.Connection, ticker: str) -> list[Bar]:
    rows = conn.execute(
        "select day, open, high, low, close, volume from prices_daily where ticker = %s order by day",
        (ticker,)).fetchall()
    return [Bar(r["day"], float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]),
                float(r["volume"]) if r["volume"] is not None else None) for r in rows]


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


def run_all(conn: psycopg.Connection, ticker: str, rates: list[tuple] | None = None) -> dict[str, engine.Result]:
    bars = load_bars(conn, ticker)
    rates = load_rates(conn) if rates is None else rates
    sales = load_sales(conn, ticker)
    return {key: engine.evaluate(spec, bars, events_for(key, bars, rates, sales))
            for key, spec in engine.SPECS.items()}


def run_one(conn: psycopg.Connection, ticker: str, spec_key: str) -> engine.Result:
    bars = load_bars(conn, ticker)
    spec = engine.SPECS[spec_key]
    return engine.evaluate(spec, bars, events_for(spec_key, bars, load_rates(conn), load_sales(conn, ticker)))
