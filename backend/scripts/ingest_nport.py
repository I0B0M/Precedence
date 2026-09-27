"""Load ETF holdings from each fund's own newest public N-PORT filing on SEC EDGAR: QQQ (Invesco QQQ Trust),
VOO (Vanguard 500 Index Fund) and IVV (iShares Core S&P 500 ETF).

Tickers come from an exact CUSIP match against State Street's SPY file (the newest one cached). Where iShares
gives only an ISIN, the CUSIP comes from Vanguard's filing, which lists both for the same stock. Holdings without
a match are stored under their own identifier. Nothing is written for a fund if its stock lines don't add up to
about 100%, or if the filing is for another series.

    uv run python scripts/ingest_nport.py            # fetch (cached) and load
    uv run python scripts/ingest_nport.py --dry-run  # fetch and parse only; write nothing
    uv run python scripts/ingest_nport.py --offline  # cached files only, no network
    uv run python scripts/ingest_nport.py --only=VOO,IVV  # parse all, write only these
"""

import sys
from datetime import date

from stone import config, db
from stone.ingest import store
from stone.sources.etfs import SpdrClient
from stone.sources.nport import QQQ_CIK, QQQ_SOURCE, SERIES_FUNDS, NportRejected, cusips_by_isin, parse_nport
from stone.sources.sec import SecClient

settings = config.load()
offline = "--offline" in sys.argv
sec = SecClient(settings, offline=offline)
spy = SpdrClient(settings, offline=True).holdings("SPY", date.today())  # the CUSIP -> ticker key
by_cusip = {c: t for t, c in spy.cusips.items()}
conn = None if "--dry-run" in sys.argv else db.connect()
if conn:
    db.apply_schema(conn)


def report(etf, accession, filed, h):
    print(f"{etf}: NPORT-P {accession}, filed {filed}, holdings as of {h.as_of}; {len(h.weights)} stocks adding up to "
          f"{sum(h.weights.values()):.2%}; {len(h.weights) - len(h.unmatched)} matched to a ticker by CUSIP (SPY file "
          f"as of {spy.as_of}), {len(h.unmatched)} kept under their own identifier: "
          f"{', '.join(h.names[k] for k in sorted(h.unmatched, key=lambda k: -h.weights[k])[:6])}...")


only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)  # --only=VOO,IVV


def load(etf, source, h):
    if only and etf not in only:
        print(f"  {etf} not loaded (--only)")
        return
    if conn:
        store.upsert_etf_holdings(conn, etf, h.as_of, h.weights, source, h.names)
        conn.commit()
        print("  loaded into etf_holdings")


latest = sec.latest_nport(QQQ_CIK)
if latest is None:
    sys.exit("No NPORT-P filing found for the Invesco QQQ Trust.")
accession, filed, reported = latest
h = parse_nport(sec.nport_xml(QQQ_CIK, accession), by_cusip)
report("QQQ", accession, filed, h)
if h.as_of != reported:
    sys.exit(f"The filing says {h.as_of} but EDGAR lists {reported}; not loading.")
load("QQQ", QQQ_SOURCE, h)

isin_pairs: dict[str, str] = {}  # filled from each filing read, VOO's first
for f in SERIES_FUNDS.values():
    for accession, filed in sec.series_nports(f.series_id):  # newest first
        xml = sec.nport_xml(f.cik, accession)
        if b"<submissionType>NPORT-P/A" in xml:
            continue  # an amendment to an older period
        try:
            h = parse_nport(xml, by_cusip, isin_pairs, series_id=f.series_id)
        except NportRejected as e:
            print(f"{f.etf}: {accession} refused ({e}); its fund page keeps SPY's holdings")
            break
        isin_pairs.update(cusips_by_isin(xml))
        report(f.etf, accession, filed, h)
        load(f.etf, f.source, h)
        break
    else:
        print(f"{f.etf}: no NPORT-P found for series {f.series_id}; its fund page keeps SPY's holdings")
