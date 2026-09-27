"""Run the FinBERT Reader over a company's 8-K filings and record the readings (the batch half of
docs/v2-plan.md, milestone M2). The engine then tests "a filing read as bad news" like any other
signal, but only with STONE_READERS=1.

    uv pip install transformers torch            # once, into backend/.venv (about 2 GB with torch)
    uv run python scripts/read_filings.py BX AMZN --limit 40
    uv run python scripts/read_filings.py --all   # every company with SEC filings

Filing text comes from the SEC (cached under data/cache/sec), so SEC_USER_AGENT must be set.
Re-running is safe: a filing already read by this model is skipped.
"""

import argparse
import sys

import psycopg
from psycopg.rows import dict_row

from stone import config
from stone.config import NotConnected
from stone.figures import html_to_text
from stone.readers.finbert import FinBertTone
from stone.sources.sec import SecClient

FORMS = ("8-K", "8-K/A")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tickers", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int, default=40, help="newest filings per company (default 40)")
    args = ap.parse_args()
    if not args.tickers and not args.all:
        ap.error("name tickers or pass --all")

    settings = config.load()
    try:
        sec = SecClient(settings)
    except NotConnected:
        print("SEC_USER_AGENT is not set; the SEC needs a contact email in the User-Agent.", file=sys.stderr)
        return 2
    reader = FinBertTone()

    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        tickers = args.tickers or [r["ticker"] for r in conn.execute(
            "select distinct ticker from filings where source = 'sec' order by ticker")]
        for t in tickers:
            t = t.upper()
            rows = conn.execute(
                """select f.accession, f.form, f.accepted_at, f.primary_doc, co.cik from filings f
                   join companies co on co.ticker = f.ticker
                   where f.ticker = %s and f.source = 'sec' and f.form = any(%s) and f.primary_doc is not null
                     and not exists (select 1 from readings r where r.ticker = f.ticker and r.accession = f.accession
                                     and r.reader = %s)
                   order by f.accepted_at desc limit %s""", (t, list(FORMS), reader.key, args.limit)).fetchall()
            done = 0
            for f in rows:
                try:
                    text = html_to_text(sec.document(f["cik"], f["accession"], f["primary_doc"]))
                except Exception as e:  # one unreadable filing must not stop the run
                    print(f"{t} {f['accession']}: skipped ({e})", file=sys.stderr)
                    continue
                tone = reader.read(text)
                conn.execute(
                    """insert into readings (ticker, accession, reader, form, accepted_at, negative, neutral, positive,
                                             sentences, model)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       on conflict (ticker, accession, reader) do update set negative = excluded.negative,
                         neutral = excluded.neutral, positive = excluded.positive, sentences = excluded.sentences,
                         model = excluded.model, read_at = now()""",
                    (t, f["accession"], reader.key, f["form"], f["accepted_at"], tone.negative, tone.neutral,
                     tone.positive, tone.sentences, reader.model_name))
                done += 1
            conn.commit()
            print(f"{t}: {done} filings read ({len(rows)} pending before)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
