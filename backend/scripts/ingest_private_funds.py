"""Load BREIT and BCRED from SEC EDGAR: monthly Class I NAVs (BREIT 424B3 supplements, BCRED 8-K Item 8.01),
what each invests in and its repurchase limits (quoted from its latest 10-Q / 10-K), and report links.

    uv run python scripts/ingest_private_funds.py            # fetch (cached) and load
    uv run python scripts/ingest_private_funds.py --dry-run  # fetch and parse only; write nothing
    uv run python scripts/ingest_private_funds.py --offline  # cached files only, no network
"""

import sys
from datetime import date

from stone import config, db
from stone.figures import html_to_text
from stone.ingest.private_funds import collect, store
from stone.sources.private_funds import FUNDS, month_back
from stone.sources.sec import SecClient

SINCE_MONTHS = 16  # a 12-month return needs the month end a year before the latest, plus some room

sec = SecClient(config.load(), offline="--offline" in sys.argv)
since = month_back(date.today(), SINCE_MONTHS)
conn = None if "--dry-run" in sys.argv else db.connect()
if conn:
    db.apply_schema(conn)
for fund in FUNDS.values():
    text_of = lambda f, cik=fund.cik: html_to_text(sec.document(cik, f.accession, f.primary_doc), limit=10**9)
    load = collect(fund, sec.recent_filings(fund.cik), text_of, since)
    months = sorted(load.navs)
    print(f"{fund.ticker} (CIK {fund.cik}): {len(months)} Class I NAVs {months[0] if months else '-'} to "
          f"{months[-1] if months else '-'}; {len(load.skipped)} {fund.nav_form}s without a NAV skipped; "
          f"invests_in {'found' if load.invests_in else 'NOT FOUND'}; liquidity {'found' if load.liquidity else 'NOT FOUND'}; "
          f"links {[f.form for f in load.links]}")
    if conn:
        print(f"  {store(conn, load)} new NAV rows")
        conn.commit()
