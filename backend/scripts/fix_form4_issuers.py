"""Remove insider_trades rows from Form 4s where the company was the REPORTING OWNER, not the issuer
(e.g. Blackstone funds selling a portfolio company's shares). The parser now drops these on ingest;
this cleans rows loaded before that fix. Reads each Form 4 from the local cache, no network.

    uv run python scripts/fix_form4_issuers.py          # dry run: report per ticker, change nothing
    uv run python scripts/fix_form4_issuers.py --apply  # delete the rows, then re-run scan_signals.py
"""

import sys

from stone import config, db
from stone.fetch import CachedFetcher, RateLimiter
from stone.ingest.tickers import TICKERS
from stone.signals import engine, service
from stone.sources.sec import form4_issuer_cik

apply = "--apply" in sys.argv
conn = db.connect()
cache = CachedFetcher("sec", config.load().cache_dir, RateLimiter(1), offline=True)
also = {t.symbol: set(t.also_ciks) for t in TICKERS}
tickers = conn.execute(
    """select i.ticker, c.cik from insider_trades i join companies c on c.ticker = i.ticker
       where i.source = 'sec' group by i.ticker, c.cik order by 1""").fetchall()

total_bad = 0
for row in tickers:
    t, ciks = row["ticker"], {row["cik"], *also.get(row["ticker"], set())}
    accs = conn.execute(
        """select accession, count(*) filter (where code = 'S') as sales from insider_trades
           where ticker = %s group by accession""", (t,)).fetchall()
    bad, unchecked = [], 0
    for a in accs:
        path = cache.path_for(f"form4_{a['accession']}.xml")
        if not path.exists():
            unchecked += 1
            continue
        if form4_issuer_cik(path.read_bytes()) not in ciks:
            bad.append(a["accession"])
    bad_sales = sum(a["sales"] for a in accs if a["accession"] in bad)
    sales = service.load_sales(conn, t)
    before = engine.detect_insider_clusters(sales)
    after = engine.detect_insider_clusters([s for s in sales if s[0] not in bad])
    bars = service.load_bars(conn, t)
    rb = engine.evaluate(engine.INSIDER, bars, before)
    ra = engine.evaluate(engine.INSIDER, bars, after)
    print(f"{t:6} Form 4s {len(accs):4} -> {len(accs) - len(bad):4} | sale lines "
          f"{sum(a['sales'] for a in accs):5} -> {sum(a['sales'] for a in accs) - bad_sales:5} | insider cluster "
          f"n={rb.n} {rb.label}{' firing' if rb.firing else ''} -> n={ra.n} {ra.label}{' firing' if ra.firing else ''}"
          + (f" | {unchecked} not in cache, kept" if unchecked else ""))
    total_bad += len(bad)
    if apply and bad:
        conn.execute("delete from insider_trades where ticker = %s and accession = any(%s)", (t, bad))
if apply:
    conn.commit()
print(f"{total_bad} Form 4s where the company was not the issuer: {'DELETED' if apply else 'dry run, nothing changed'}")
