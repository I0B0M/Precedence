"""Load real ETF holdings from the issuer's daily file (SPY from State Street).

    uv run python scripts/ingest_etfs.py            # fetch today's file (cached) and load it
    uv run python scripts/ingest_etfs.py --dry-run  # fetch and parse only; write nothing
    uv run python scripts/ingest_etfs.py --offline  # newest cached file, no network
"""

import sys
from datetime import date

from stone import config, db
from stone.ingest import store
from stone.sources.etfs import SUPPORTED, SpdrClient

client = SpdrClient(config.load(), offline="--offline" in sys.argv)
conn = None if "--dry-run" in sys.argv else db.connect()
for etf in SUPPORTED:
    h = client.holdings(etf, date.today())
    top = sorted(h.weights.items(), key=lambda kv: -kv[1])[:3]
    print(f"{etf}: {len(h.weights)} holdings as of {h.as_of} from {h.source}, weights sum to "
          f"{sum(h.weights.values()):.1%}; top {', '.join(f'{t} {w:.1%}' for t, w in top)}")
    if conn:
        db.apply_schema(conn)
        store.upsert_etf_holdings(conn, etf, h.as_of, h.weights, h.source)
        conn.commit()
        print("  loaded into etf_holdings")
