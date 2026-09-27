"""Check the Gemini connection end to end, through the same API endpoints the app calls.

    uv run python scripts/check_gemini.py                        # read the demo screenshot and reconcile it
    uv run python scripts/check_gemini.py path/to/screenshot.png  # any PNG, JPEG, WebP or HEIC screenshot
    uv run python scripts/check_gemini.py --filing <accession>    # summarize a filing, figures checked vs XBRL

Needs GEMINI_API_KEY in backend/.env (never printed); a filing also needs its SEC document, so
SEC_USER_AGENT and a real ingest. Answers are cached in data/cache/gemini/, so a second run of
the same screenshot or filing costs nothing. Exits non-zero when the check fails.
"""

import mimetypes
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

from stone.api.main import app
from stone.sources.gemini import MODEL

DEMO = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "demo_screenshot.png"
client = TestClient(app)
started = time.monotonic()
print(f"model {MODEL}")

if "--filing" in sys.argv:
    accession = sys.argv[sys.argv.index("--filing") + 1]
    r = client.get(f"/api/filings/{accession}/summary")
    if r.status_code != 200:
        sys.exit(f"HTTP {r.status_code}: {r.json().get('detail')}")
    body = r.json()
    print(f"{body['ticker']} {body['form']} {accession} ({'cached' if body['cached'] else 'fresh'}, "
          f"{time.monotonic() - started:.1f}s)\n\n{body['summary_lite']}\n")
    for f in body["figures"]:
        mark = {True: "matches", False: "DIFFERS from", None: "can't be checked against"}[f["match"]]
        xbrl = f" {f['concept']} = {f['xbrl_value']:,.0f}" if f["xbrl_value"] is not None else ""
        print(f"  {f['label']}: {f['text_value']}  {mark} XBRL{xbrl}")
    sys.exit(1 if any(f["match"] is False for f in body["figures"]) else 0)

path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEMO
mime = mimetypes.guess_type(path.name)[0] or "image/png"
r = client.post("/api/import/screenshot", files={"file": (path.name, path.read_bytes(), mime)})
if r.status_code != 200:
    sys.exit(f"HTTP {r.status_code}: {r.json().get('detail')}")
body = r.json()
print(f"read {path.name} in {time.monotonic() - started:.1f}s\n")
for row in body["rows"]:
    shares = "-" if row["shares"] is None else f"{row['shares']:g}"
    value = "-" if row["value"] is None else f"${row['value']:,.2f}"
    print(f"  {row['symbol']:6} {shares:>8} shares  {value:>12}  {'ok' if row['ok'] else row['problem']}")
print(f"\n{body['status']}: {body['message']}")
sys.exit(0 if body["status"] in ("ok", "fixable") else 1)
