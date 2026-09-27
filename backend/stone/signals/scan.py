"""One full scan of every stock x signal, recorded so "how many did you test?" has a real answer,
and so each result can say whether it survives testing them all at once (Benjamini-Hochberg)."""

from dataclasses import dataclass
from datetime import datetime

import psycopg

from stone.signals import engine, service

FDR_Q = 0.10


@dataclass
class Scan:
    run_at: datetime
    stocks: list[str]
    results: dict[tuple[str, str], engine.Result]  # (ticker, signal) -> result
    tested_pairs: list[tuple[str, str, float]]  # (ticker, signal, p) for every pair with a p-value (10+ cases)
    survives: list[bool]  # lines up with tested_pairs
    counts: dict[str, int]
    tested: int
    eligible: int
    strong: list[tuple[str, str, engine.Result]]
    held: int
    strong_fdr10: int


def run(conn: psycopg.Connection, stocks: list[str], run_at: datetime, as_of) -> Scan:
    """Runs every signal on every stock, writes one signal_scans row plus one signal_scan_pairs row
    per tested pair, and commits."""
    rates = service.load_rates(conn)
    market = service.load_market(conn)[1]
    results, tested_pairs, strong = {}, [], []
    counts = {engine.STRONG: 0, engine.WEAK: 0, engine.NOT_PROVEN: 0, engine.NO_DATA: 0}
    for t in stocks:
        for key, r in service.run_all(conn, t, rates, market).items():
            results[(t, key)] = r
            counts[r.label] += 1
            if (p := engine.p_value(r)) is not None:
                tested_pairs.append((t, key, p))
            if r.label == engine.STRONG:
                strong.append((t, key, r))
    tested = len(engine.SPECS) * len(stocks) - counts[engine.NO_DATA]  # pairs without data weren't tested
    eligible = counts[engine.STRONG] + counts[engine.NOT_PROVEN]
    held = sum(1 for *_, r in strong if r.holdout and r.holdout.held_up)
    # Benjamini-Hochberg at a 10% false discovery rate across every tested pair; the STRONG rule itself is unchanged
    survives = engine.benjamini_hochberg([p for *_, p in tested_pairs], q=FDR_Q)
    fdr = {(t, key) for (t, key, _), keep in zip(tested_pairs, survives) if keep}
    strong_fdr10 = sum(1 for t, key, _ in strong if (t, key) in fdr)
    conn.execute("""insert into signal_scans (run_at, stocks, tested, eligible, strong, strong_held_up,
                                              expected_by_chance, as_of, strong_fdr10)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                 (run_at, len(stocks), tested, eligible, len(strong), held, 0.05 * eligible, as_of, strong_fdr10))
    # per pair, so each result can say whether it survives (SignalResult.fdr10_survives)
    conn.cursor().executemany("insert into signal_scan_pairs values (%s, %s, %s, %s, %s)",
                              [(run_at, t, key, p, keep) for (t, key, p), keep in zip(tested_pairs, survives)])
    conn.commit()
    return Scan(run_at, stocks, results, tested_pairs, survives, counts, tested, eligible, strong, held, strong_fdr10)


def fdr10_by_signal(conn: psycopg.Connection, ticker: str) -> dict[str, bool]:
    """The latest scan's Benjamini-Hochberg verdict for each of this stock's signals. A signal missing here
    wasn't in that run (fewer than 10 cases, no p-value, a fund, no scan yet, or a scan from before pairs were kept)."""
    rows = conn.execute(
        """select signal, fdr10 from signal_scan_pairs
           where ticker = %s and run_at = (select max(run_at) from signal_scans)""", (ticker,)).fetchall()
    return {r["signal"]: r["fdr10"] for r in rows}
