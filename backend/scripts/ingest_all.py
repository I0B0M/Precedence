"""Load real data: SEC filings, XBRL, Form 4s, Alpaca prices, FRED DGS10.

    uv run python scripts/ingest_all.py            # fetch what isn't cached yet
    uv run python scripts/ingest_all.py --offline  # rebuild from data/cache only
    uv run python scripts/ingest_all.py --only BX   # just these tickers (comma-separated)

Sources without a key in backend/.env are skipped with a message.
"""

import sys
from datetime import date

from stone import config, db
from stone.ingest import pipeline

conn = db.connect()
db.apply_schema(conn)
only = None
if "--only" in sys.argv:
    only = set(sys.argv[sys.argv.index("--only") + 1].upper().split(","))
pipeline.run(conn, config.load(), date.today(), offline="--offline" in sys.argv, only=only)
