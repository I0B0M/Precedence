"""Load QQQ's holdings from the Invesco QQQ Trust's newest public N-PORT filing on SEC EDGAR.

Tickers come from an exact CUSIP match against State Street's SPY file (the newest one cached);
holdings without a match are stored under their own identifier. Nothing is written if the stock
lines don't add up to about 100% of the fund.

    uv run python scripts/ingest_nport.py            # fetch (cached) and load
    uv run python scripts/ingest_nport.py --dry-run  # fetch and parse only; write nothing
    uv run python scripts/ingest_nport.py --offline  # cached files only, no network
"""

import sys
from datetime import date

from stone import config, db
from stone.ingest import store
from stone.sources.etfs import SpdrClient
from stone.sources.nport import QQQ_CIK, QQQ_SOURCE, parse_nport
from stone.sources.sec import SecClient

settings = config.load()
offline = "--offline" in sys.argv
sec = SecClient(settings, offline=offline)
latest = sec.latest_nport(QQQ_CIK)
if latest is None:
    sys.exit("No NPORT-P filing found for the Invesco QQQ Trust.")
accession, filed, reported = latest
spy = SpdrClient(settings, offline=True).holdings("SPY", date.today())  # the CUSIP -> ticker key
h = parse_nport(sec.nport_xml(QQQ_CIK, accession), {c: t for t, c in spy.cusips.items()})
print(f"QQQ: NPORT-P {accession}, filed {filed}, holdings as of {h.as_of} (EDGAR report date {reported}); "
      f"{len(h.weights)} stocks adding up to {sum(h.weights.values()):.2%}; "
      f"{len(h.weights) - len(h.unmatched)} matched to a ticker by CUSIP (SPY file as of {spy.as_of}), "
      f"{len(h.unmatched)} kept under their own identifier; skipped (not stocks): {', '.join(h.skipped)}")
if h.as_of != reported:
    sys.exit(f"The filing says {h.as_of} but EDGAR lists {reported}; not loading.")
if "--dry-run" not in sys.argv:
    conn = db.connect()
    db.apply_schema(conn)
    store.upsert_etf_holdings(conn, "QQQ", h.as_of, h.weights, QQQ_SOURCE, h.names)
    conn.commit()
    print("  loaded into etf_holdings")
