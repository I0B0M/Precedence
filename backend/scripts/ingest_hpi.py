"""Load FHFA's annual house price index (ZIP5, county, state) for home estimates.

The three files are downloaded once and cached (data/cache/fhfa); the ZIP5 file is ~40 MB.
Reloading replaces only FHFA's own rows in house_price_index.

    uv run python scripts/ingest_hpi.py            # fetch if not cached, then load
    uv run python scripts/ingest_hpi.py --offline  # cached files only
"""

import sys

from stone import config, db
from stone.sources.fhfa import FILES, FhfaClient

conn = db.connect()
db.apply_schema(conn)
client = FhfaClient(config.load(), offline="--offline" in sys.argv)
for level in FILES:
    conn.execute("delete from house_price_index where level = %s and source = 'fhfa'", (level,))
    n, areas, last = 0, set(), 0
    with conn.cursor().copy("copy house_price_index (level, area, year, hpi, source) from stdin") as cp:
        for area, year, hpi in client.rows(level):
            cp.write_row((level, area, year, hpi, "fhfa"))
            n, last = n + 1, max(last, year)
            areas.add(area)
    conn.commit()
    print(f"{level}: {n} index values for {len(areas)} areas, latest year {last}", flush=True)
