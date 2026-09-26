"""Sample data for development: FICTIONAL companies, generated prices, planted patterns.

Nothing here is real. Tickers are made up (HLCN, MRDN, ORCA, BRVE, BRD500) so the
sample can never be mistaken for a real stock, every row is written with
source='sample', and the UI shows a SAMPLE DATA banner while any sample rows exist.

Planted so the demo shows every state:
  HLCN  insider-selling clusters followed by falls; one cluster this week  -> WATCH
  MRDN  a bank that falls after rate jumps; a jump this week               -> WATCH
  ORCA  nothing unusual                                                    -> CALM
  BRVE  a few gap-downs, too few to prove anything; one this week          -> CALM (WEAK)
"""

import math
import random
from datetime import date, datetime, time, timedelta

import psycopg

from stone.ingest import store
from stone.signals.engine import EASTERN, rate_known_at
from stone.sources.prices import Bar
from stone.sources.sec import Fact, Filing, InsiderTrade

SOURCE = "sample"

COMPANIES = [
    ("HLCN", "Halcyon Semiconductor", "Semiconductors", "stock", 84.0, 0.0006, 0.022),
    ("MRDN", "Meridian Regional Bank", "Banks", "stock", 41.0, 0.0003, 0.014),
    ("ORCA", "Orca Freight & Logistics", "Industrials", "stock", 122.0, 0.0002, 0.012),
    ("BRVE", "Brave Outdoor Retail", "Consumer", "stock", 57.0, 0.0004, 0.018),
    ("BRD500", "Broad 500 Index Fund", "Index", "etf", 410.0, 0.0004, 0.009),
]
ETF_WEIGHTS = {"BRD500": {"HLCN": 0.041, "MRDN": 0.012, "ORCA": 0.008, "BRVE": 0.005}}

DEFAULT_PORTFOLIO = [("HLCN", 62), ("MRDN", 140), ("ORCA", 30), ("BRVE", 55), ("BRD500", 12)]


def trading_days(end: date, n: int) -> list[date]:
    out, d = [], end
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return out[::-1]


def last_weekday(d: date) -> date:
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def make_bars(days: list[date], start: float, drift: float, vol: float, rng: random.Random,
              extra: dict[int, float], gaps: dict[int, float]) -> list[Bar]:
    """extra: day index -> added daily drift. gaps: day index -> overnight drop (e.g. -0.07)."""
    bars, close = [], start
    for i, d in enumerate(days):
        overnight = gaps.get(i, rng.gauss(0, vol * 0.25))
        o = close * math.exp(overnight)
        c = o * math.exp(drift + extra.get(i, 0.0) + rng.gauss(0, vol))
        hi = max(o, c) * (1 + abs(rng.gauss(0, vol * 0.3)))
        lo = min(o, c) * (1 - abs(rng.gauss(0, vol * 0.3)))
        bars.append(Bar(d, round(o, 2), round(hi, 2), round(lo, 2), round(c, 2), float(rng.randint(2, 9) * 10**6)))
        close = c
    return bars


def index_of_entry(days: list[date], known: datetime) -> int:
    for i, d in enumerate(days):
        if datetime.combine(d, time(9, 30), tzinfo=EASTERN) > known:
            return i
    return len(days)


def seed(conn: psycopg.Connection, today: date, seed_value: int = 7) -> None:
    rng = random.Random(seed_value)
    end = last_weekday(today - timedelta(days=1))
    days = trading_days(end, 504)  # about 2 years
    n = len(days)

    # --- rates: a noisy DGS10 with planted jumps, the last one this week ---
    rate_days = days
    jump_at = list(range(30, n - 20, 31)) + [n - 3]
    level, rates = 4.10, []
    for i, d in enumerate(rate_days):
        level += rng.gauss(0, 0.025)
        if any(0 <= i - j < 3 for j in jump_at):
            level += 0.075
        level -= (level - 4.1) * 0.02
        rates.append((d, round(level, 2)))
    rate_entries = [index_of_entry(days, rate_known_at(rate_days[j + 2])) for j in jump_at]

    # --- insider clusters for HLCN: 3 filings over 5 days, then a fall ---
    cluster_starts = list(range(25, n - 30, 38)) + [n - 7]
    hlcn_filings, hlcn_trades, hlcn_entries = [], [], []
    for c, s in enumerate(cluster_starts):
        for k, off in enumerate((0, 2, 4)):
            d = days[min(s + off, n - 1)]
            acc = f"SAMPLE-HLCN-4-{c:02d}{k}"
            accepted = datetime.combine(d, time(17, 5), tzinfo=EASTERN)
            hlcn_filings.append(Filing(acc, "4", d, accepted, d, "form4.xml"))
            hlcn_trades.append((acc, accepted, [InsiderTrade(0, f"SAMPLE OFFICER {k + 1}", "Officer", d, "S",
                                                             float(rng.randint(5, 40) * 1000), None, "D")]))
        hlcn_entries.append(min(s + 5, n - 1))

    def falls(entries: list[int], horizon: int, per_day: float) -> dict[int, float]:
        out = {}
        for e in entries:
            for k in range(e, min(e + horizon, n)):
                out[k] = per_day
        return out

    brve_gaps = {i: -0.07 for i in (90, 260, 400, n - 4)}
    plans = {
        "HLCN": (falls(hlcn_entries, 20, -0.006), {}),
        "MRDN": (falls(rate_entries, 5, -0.012), {}),
        "ORCA": ({}, {}),
        "BRVE": ({}, brve_gaps),
        "BRD500": ({}, {}),
    }

    store.delete_source(conn, SOURCE)
    for ticker, name, sector, kind, start, drift, vol in COMPANIES:
        store.upsert_company(conn, ticker, None, name, sector, kind, SOURCE)
        extra, gaps = plans[ticker]
        store.upsert_bars(conn, ticker, make_bars(days, start, drift, vol, rng, extra, gaps), SOURCE)
    store.upsert_rates(conn, "DGS10", rates, SOURCE)
    store.upsert_etf_holdings(conn, "BRD500", end, ETF_WEIGHTS["BRD500"], SOURCE)

    # --- filings and financials: 8 quarters each, plus HLCN's Form 4s ---
    for ticker, _, _, kind, start, _, _ in COMPANIES:
        if kind != "stock":
            continue
        filings, facts = [], []
        revenue = start * 40e6
        for q in range(8):
            period_end = end - timedelta(days=91 * (8 - q)) - timedelta(days=30)
            filed = period_end + timedelta(days=35)
            form = "10-K" if q % 4 == 3 else "10-Q"
            acc = f"SAMPLE-{ticker}-{form}-{q}"
            filings.append(Filing(acc, form, filed, datetime.combine(filed, time(16, 30), tzinfo=EASTERN),
                                  period_end, f"{ticker.lower()}-{period_end}.htm"))
            revenue *= 1 + rng.gauss(0.02, 0.03)
            margin = rng.uniform(0.08, 0.22)
            p_start = period_end - timedelta(days=90)
            facts += [
                Fact("us-gaap", "Revenues", "USD", p_start, period_end, round(revenue), acc, None, f"Q{q % 4 + 1}", form, filed, None),
                Fact("us-gaap", "NetIncomeLoss", "USD", p_start, period_end, round(revenue * margin), acc, None, f"Q{q % 4 + 1}", form, filed, None),
                Fact("us-gaap", "Assets", "USD", None, period_end, round(revenue * 6.5), acc, None, f"Q{q % 4 + 1}", form, filed, None),
                Fact("us-gaap", "LongTermDebt", "USD", None, period_end, round(revenue * 1.4), acc, None, f"Q{q % 4 + 1}", form, filed, None),
            ]
        if ticker == "HLCN":
            filings += hlcn_filings
        store.upsert_filings(conn, ticker, filings, SOURCE)
        store.upsert_facts(conn, ticker, facts, SOURCE)
    for acc, accepted, trades in hlcn_trades:
        store.upsert_trades(conn, "HLCN", acc, accepted, trades, SOURCE)
    conn.commit()
