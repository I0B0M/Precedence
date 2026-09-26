"""Load Form 4s for stocks that have none stored yet (the S&P 100 beyond the first 20).

Uses the Form 4 filings already listed in the database, so nothing else is re-fetched. Every XML
is cached first (data/cache/sec); a re-run only fetches what's missing. Filings where the company
is the reporting owner, not the issuer, are dropped by the parser. Only adds rows.

    uv run python scripts/load_form4s.py            # every stock without Form 4 data
    uv run python scripts/load_form4s.py --only BLK,GS
"""

import sys

from stone import config, db
from stone.ingest import store
from stone.ingest.tickers import TICKERS
from stone.sources.sec import Filing, SecClient

conn = db.connect()
sec = SecClient(config.load(), offline="--offline" in sys.argv)
also = {t.symbol: set(t.also_ciks) for t in TICKERS}
only = set(sys.argv[sys.argv.index("--only") + 1].upper().split(",")) if "--only" in sys.argv else None

todo = conn.execute(
    """select c.ticker, c.cik from companies c
       where c.kind = 'stock' and c.source = 'sec' and c.cik is not null
         and not exists (select 1 from insider_trades i where i.ticker = c.ticker) order by 1""").fetchall()
for row in todo:
    t, cik = row["ticker"], row["cik"]
    if only and t not in only:
        continue
    filings = conn.execute(
        """select accession, form, filed_date, accepted_at, report_date, primary_doc from filings
           where ticker = %s and form = '4' and source = 'sec' order by accepted_at""", (t,)).fetchall()
    kept = failed = 0
    for f in filings:
        filing = Filing(f["accession"], f["form"], f["filed_date"], f["accepted_at"], f["report_date"], f["primary_doc"])
        try:
            trades = sec.form4(cik, filing, {cik, *also.get(t, set())})
        except Exception as e:  # one bad Form 4 must not stop the run
            failed += 1
            print(f"  {t} Form 4 {f['accession']}: {e}")
            continue
        if trades:
            store.upsert_trades(conn, t, f["accession"], f["accepted_at"], trades, "sec")
            kept += 1
    conn.commit()
    print(f"{t}: {len(filings)} Form 4s listed, {kept} about {t}'s own stock, {failed} failed", flush=True)
