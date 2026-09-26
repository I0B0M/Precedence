"""Fill the database with FICTIONAL sample companies for development.

    uv run python scripts/seed_sample.py           # add or refresh sample rows
    uv run python scripts/seed_sample.py --clear   # remove every sample row
"""

import sys
from datetime import date

from stone import db
from stone.ingest import sample, store

conn = db.connect()
db.apply_schema(conn)
if "--clear" in sys.argv:
    store.delete_source(conn, sample.SOURCE)
    conn.commit()
    print("Removed all sample rows.")
else:
    sample.seed(conn, date.today())
    print("Seeded sample data (fictional: HLCN, MRDN, ORCA, BRVE, BRD500).")
