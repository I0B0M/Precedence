"""Writes to Postgres. Used by both the real ingest and the sample seed, so sample
data goes through exactly the same path as real data. Every write is an upsert:
re-running an ingest never duplicates rows."""

from datetime import date, datetime

import psycopg

from stone.sources.prices import Bar
from stone.sources.sec import Fact, Filing, InsiderTrade


def upsert_company(conn: psycopg.Connection, ticker: str, cik: int | None, name: str,
                   sector: str | None, kind: str, source: str) -> None:
    conn.execute(
        """insert into companies (ticker, cik, name, sector, kind, source)
           values (%s, %s, %s, %s, %s, %s)
           on conflict (ticker) do update set cik = excluded.cik, name = excluded.name,
               sector = excluded.sector, kind = excluded.kind, source = excluded.source""",
        (ticker, cik, name, sector, kind, source))


def upsert_filings(conn: psycopg.Connection, ticker: str, filings: list[Filing], source: str) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            """insert into filings (accession, ticker, form, filed_date, accepted_at, report_date, primary_doc, source)
               values (%s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (accession) do update set form = excluded.form, filed_date = excluded.filed_date,
                   accepted_at = excluded.accepted_at, report_date = excluded.report_date,
                   primary_doc = excluded.primary_doc""",
            [(f.accession, ticker, f.form, f.filed_date, f.accepted_at, f.report_date, f.primary_doc, source)
             for f in filings])


def upsert_facts(conn: psycopg.Connection, ticker: str, facts: list[Fact], source: str) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            """insert into xbrl_facts (ticker, taxonomy, concept, unit, period_start, period_end, value,
                   accession, fiscal_year, fiscal_period, form, filed, frame, source)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               on conflict do nothing""",
            [(ticker, f.taxonomy, f.concept, f.unit, f.period_start, f.period_end, f.value, f.accession,
              f.fiscal_year, f.fiscal_period, f.form, f.filed, f.frame, source) for f in facts])


def upsert_trades(conn: psycopg.Connection, ticker: str, accession: str, accepted_at: datetime,
                  trades: list[InsiderTrade], source: str) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            """insert into insider_trades (accession, seq, ticker, owner_name, owner_title, transaction_date,
                   code, shares, price, acquired_disposed, accepted_at, source)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (accession, seq) do update set accepted_at = excluded.accepted_at,
                   code = excluded.code, shares = excluded.shares, price = excluded.price""",
            [(accession, t.seq, ticker, t.owner_name, t.owner_title, t.transaction_date, t.code,
              t.shares, t.price, t.acquired_disposed, accepted_at, source) for t in trades])


def upsert_bars(conn: psycopg.Connection, ticker: str, bars: list[Bar], source: str) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            """insert into prices_daily (ticker, day, open, high, low, close, volume, source)
               values (%s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (ticker, day) do update set open = excluded.open, high = excluded.high,
                   low = excluded.low, close = excluded.close, volume = excluded.volume,
                   source = excluded.source""",
            [(ticker, b.day, b.open, b.high, b.low, b.close, b.volume, source) for b in bars])


def upsert_rates(conn: psycopg.Connection, series: str, obs: list[tuple[date, float]], source: str) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            """insert into rates (series, day, value, source) values (%s, %s, %s, %s)
               on conflict (series, day) do update set value = excluded.value, source = excluded.source""",
            [(series, d, v, source) for d, v in obs])


def upsert_etf_holdings(conn: psycopg.Connection, etf: str, as_of: date,
                        weights: dict[str, float], source: str, names: dict[str, str] | None = None) -> None:
    """names: the issuer's name per holding; a name already stored is kept when the file has none."""
    names = names or {}
    with conn.cursor() as cur:
        cur.executemany(
            """insert into etf_holdings (etf, holding, weight, as_of, source, name) values (%s, %s, %s, %s, %s, %s)
               on conflict (etf, holding, as_of) do update
               set weight = excluded.weight, name = coalesce(excluded.name, etf_holdings.name)""",
            [(etf, h, w, as_of, source, names.get(h)) for h, w in weights.items()])


def delete_source(conn: psycopg.Connection, source: str) -> None:
    """Remove every row from one source, children before parents."""
    for table in ("etf_holdings", "insider_trades", "xbrl_facts", "prices_daily", "filings", "rates"):
        conn.execute(f"delete from {table} where source = %s", (source,))
    conn.execute(
        """delete from companies c where c.source = %s
           and not exists (select 1 from filings f where f.ticker = c.ticker)
           and not exists (select 1 from prices_daily p where p.ticker = c.ticker)""", (source,))
