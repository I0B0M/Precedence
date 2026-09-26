"""Scan every real stock for honest WATCH candidates, and record the scan.

Prints (1) every signal firing now whose verdict is STRONG, and (2) the NOT PROVEN
signals with at least 10 cases, ranked by how far the hit rate beats the normal rate.
Nothing is tuned: the thresholds are the engine's own.

    uv run python scripts/scan_signals.py
"""

from datetime import datetime, timezone

from stone import db
from stone.signals import engine, service

conn = db.connect()
db.apply_schema(conn)
stocks = [r["ticker"] for r in conn.execute(
    """select c.ticker from companies c where c.kind = 'stock' and c.source <> 'sample'
       and exists (select 1 from prices_daily p where p.ticker = c.ticker) order by 1""").fetchall()]
rates = service.load_rates(conn)
watch, gaps, strong = [], [], []
tested_pairs = []  # (ticker, signal, result, p) for every pair with 10+ cases
counts = {engine.STRONG: 0, engine.WEAK: 0, engine.NOT_PROVEN: 0, engine.NO_DATA: 0}
for t in stocks:
    for key, r in service.run_all(conn, t, rates).items():
        counts[r.label] += 1
        if (p := engine.p_value(r)) is not None:
            tested_pairs.append((t, key, r, p))
        if r.label == engine.STRONG:
            strong.append((t, key, r))
        row = (t, key, r.n, r.hits, r.hit_rate, r.normal_rate, r.normal_n, r.low, r.high, r.label, bool(r.firing))
        if r.firing and r.label == engine.STRONG:
            watch.append(row)
        if r.label == engine.NOT_PROVEN and r.hit_rate is not None and r.normal_rate is not None:
            gaps.append((r.hit_rate - r.normal_rate, row))

f = lambda x: "-" if x is None else f"{x:.0%}"
tested = 3 * len(stocks) - counts[engine.NO_DATA]  # pairs without data weren't tested
eligible = counts[engine.STRONG] + counts[engine.NOT_PROVEN]
held = sum(1 for *_, r in strong if r.holdout and r.holdout.held_up)
# Benjamini-Hochberg at a 10% false discovery rate across every tested pair; the STRONG rule itself is unchanged
survives = engine.benjamini_hochberg([p for *_, p in tested_pairs], q=0.10)
fdr = {(t, key) for (t, key, _, _), keep in zip(tested_pairs, survives) if keep}
strong_fdr10 = sum(1 for t, key, _ in strong if (t, key) in fdr)
as_of = conn.execute("select max(day) as d from prices_daily where source <> 'sample'").fetchone()["d"]
conn.execute("""insert into signal_scans (run_at, stocks, tested, eligible, strong, strong_held_up,
                                          expected_by_chance, as_of, strong_fdr10)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
             (datetime.now(timezone.utc), len(stocks), tested, eligible, len(strong), held, 0.05 * eligible, as_of,
              strong_fdr10))
conn.commit()

line = lambda r: (f"  {r[0]:6} {r[1]:16} n={r[2]:3} hit={r[3]:3} ({f(r[4])}) normal={f(r[5])} of {r[6]} "
                  f"range={f(r[7])}-{f(r[8])} {r[9]}{' FIRING' if r[10] else ''}")
print(f"{len(stocks)} stocks with prices, {tested} stock-signal pairs tested: {counts}")
too_few = sum(1 for *_, r in strong if r.holdout and r.holdout.verdict == engine.TOO_FEW_TO_CHECK)
print(f"{eligible} pairs had 10+ cases; {len(strong)} STRONG, about {0.05 * eligible:.0f} expected by chance; "
      f"{held} STRONG held up in both halves (10+ cases each), {too_few} too few cases to check; "
      f"{strong_fdr10} STRONG survive Benjamini-Hochberg at 10% FDR across {len(tested_pairs)} tested pairs")
print("\nEvery STRONG, with its split-half hold-out:")
for t, key, r in strong:
    h = r.holdout
    print(f"  {t:6} {key:16} n={r.n:3} {f(r.hit_rate)} vs {f(r.normal_rate)} | 1st half {h.first.n} cases "
          f"{f(h.first.hit_rate)} vs {f(h.first.normal_rate)} | 2nd half {h.second.n} cases "
          f"{f(h.second.hit_rate)} vs {f(h.second.normal_rate)} | {h.verdict.upper() if h.held_up else h.verdict}"
          f"{' | FIRING' if r.firing else ''}")
print(f"\nFIRING NOW and STRONG (real WATCH): {len(watch)}")
for r in watch:
    print(line(r))
print("\nTop NOT PROVEN by hit rate above normal:")
for _, r in sorted(gaps, reverse=True)[:8]:
    print(line(r))
