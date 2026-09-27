"""Build the saved briefings the narration tab reads on the live site (no backend there).

    uv run python scripts/build_briefings.py

Reads frontend/public/saved/ (built by build_saved.py) and writes, in the same shapes as the API:
  saved/briefing/{TICKER}.json          GET  /api/briefing/{ticker}
  saved/briefing/portfolio/{key}.json   POST /api/briefing/portfolio, for the saved example
No network, no numbers changed. Saved signals get the current hold-out verdict and strict evidence
first (views.with_strict, which is a no-op on files that already carry them). Stops with an error,
writing nothing, if any line fails the check.
"""

import json
import sys

from stone.api.views import with_strict
from stone.briefing.panel import briefing_json, company_briefing, portfolio_briefing
from stone.config import REPO_DIR

SAVED = REPO_DIR / "frontend" / "public" / "saved"


def read(path: str):
    return json.loads((SAVED / f"{path}.json").read_text())


def current(detail: dict) -> dict:
    """A saved company page as the live API would send it now."""
    days = [p["day"] for p in detail.get("prices") or []]
    return {**detail, "signals": [with_strict(s, days) for s in detail.get("signals") or []]}


def main() -> None:
    index = read("index")
    companies = {t: current(read(f"companies/{t}")) for t in index["tickers"]}
    spy_days = [p["day"] for p in companies["SPY"]["prices"]] if "SPY" in companies else []
    market = {**read("market/rate_jump")}
    market = {"symbol": market.get("symbol", "SPY"), **with_strict(market, spy_days)}
    key = index["example_key"]
    risk_path = SAVED / "portfolio" / "risk" / f"{key}.json"
    risk = json.loads(risk_path.read_text()) if risk_path.exists() else None

    out = {f"briefing/{t}": briefing_json(company_briefing(d)) for t, d in companies.items()}
    board = read(f"portfolio/{key}")
    out[f"briefing/portfolio/{key}"] = briefing_json(portfolio_briefing(board, companies, market, risk, key))

    failed = [f"{path}: {h['reason']}" for path, b in out.items() for h in b["panel"]["held_back"]
              if h["reason"].startswith("failed the check")]
    if failed:
        sys.exit("Lines failed the check, nothing written:\n" + "\n".join(failed))
    for path, body in out.items():
        f = SAVED / f"{path}.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(body, separators=(",", ":")))
        print(f"wrote {f.relative_to(REPO_DIR)}: {len(body['lines'])} lines")


if __name__ == "__main__":
    main()
