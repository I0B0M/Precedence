"""Reading accuracy (docs/v2-plan.md): run the screenshot reader over a folder of real brokerage
screenshots and count how many reconcile against the total printed on them.

    uv run python scripts/eval_screenshots.py ~/stone-screenshots

The folder holds the images plus `expected.json`: {"robinhood-1.png": 16626.75, ...} with each
screenshot's printed total. Keep it outside the repo; it is your own account data. Needs GEMINI_API_KEY.
"""

import json
import mimetypes
import sys
from pathlib import Path

from stone import config
from stone.config import NotConnected
from stone.portfolio import reconcile as rc
from stone.sources.gemini import GeminiClient, ScreenshotUnreadable


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    folder = Path(sys.argv[1]).expanduser()
    expected = json.loads((folder / "expected.json").read_text())
    try:
        client = GeminiClient(config.load())
    except NotConnected:
        print("GEMINI_API_KEY is not set.", file=sys.stderr)
        return 2
    ok = rows_ok = rows_all = 0
    for name, total in expected.items():
        path = folder / name
        try:
            read = client.read_screenshot(path.read_bytes(), mimetypes.guess_type(name)[0] or "image/png")
        except ScreenshotUnreadable as e:
            print(f"{name}: unreadable ({e})")
            continue
        rows = [rc.Row(r.symbol, r.shares, r.price, r.value) for r in read.rows]
        result = rc.reconcile(rows, read.printed_total if read.printed_total is not None else total)
        good = result.status in ("ok", "fixable")
        ok += good
        rows_all += len(result.rows)
        rows_ok += sum(1 for r in result.rows if r.ok)
        print(f"{name}: {result.status} (rows {sum(1 for r in result.rows if r.ok)}/{len(result.rows)}, "
              f"printed {read.printed_total} vs expected {total})")
    n = len(expected)
    print(f"\n{ok}/{n} screenshots reconcile ({ok / n:.0%}); {rows_ok}/{rows_all} rows correct "
          f"({rows_ok / rows_all:.1%})" if rows_all else "\nnothing read")
    return 0


if __name__ == "__main__":
    sys.exit(main())
