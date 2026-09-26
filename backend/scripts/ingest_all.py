"""Load real data: SEC filings, XBRL, Form 4s, Massive prices, FRED DGS10.

    uv run python scripts/ingest_all.py            # fetch what isn't cached yet
    uv run python scripts/ingest_all.py --offline  # rebuild from data/cache only

Sources without a key in backend/.env are skipped with a message.
"""

import sys
from datetime import date

from stone import config, db
from stone.ingest import pipeline

conn = db.connect()
db.apply_schema(conn)
pipeline.run(conn, config.load(), date.today(), offline="--offline" in sys.argv)
