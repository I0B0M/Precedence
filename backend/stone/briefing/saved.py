"""The briefings for the saved demo data (frontend/public/saved), in the same shapes as the API:

  saved/briefing/{TICKER}.json          GET  /api/briefing/{ticker}
  saved/briefing/portfolio/{key}.json   POST /api/briefing/portfolio, for the saved example

Built from the saved files alone, no network, no numbers changed. scripts/build_saved.py calls
build() after stone.saved.finish(); scripts/build_briefings.py runs it on its own. Writes nothing,
and raises, if any line fails the check.
"""

import json
from pathlib import Path

from stone.api.views import with_strict
from stone.briefing.panel import Briefing, briefing_json, company_briefing, portfolio_briefing
from stone.config import REPO_DIR

SAVED = REPO_DIR / "frontend" / "public" / "saved"


class FailedCheck(ValueError):
    """A saved briefing line said a number its evidence doesn't hold, or broke the tab's format."""


def _read(out: Path, path: str):
    return json.loads((out / f"{path}.json").read_text())


def current(detail: dict) -> dict:
    """A saved company page as the live API would send it now (a no-op once stone.saved.finish() ran)."""
    days = [p["day"] for p in detail.get("prices") or []]
    return {**detail, "signals": [with_strict(s, days) for s in detail.get("signals") or []]}


def briefings(out: Path = SAVED) -> dict[str, Briefing]:
    """{saved path: briefing} for every saved ticker and the saved example portfolio."""
    index = _read(out, "index")
    companies = {t: current(_read(out, f"companies/{t}")) for t in index["tickers"]}
    market = _read(out, "market/rate_jump")
    spy_days = [p["day"] for p in companies.get("SPY", {}).get("prices") or []]
    market = {"symbol": market.get("symbol", "SPY"), **with_strict(market, spy_days)}
    key = index["example_key"]
    risk_file = out / "portfolio" / "risk" / f"{key}.json"
    risk = json.loads(risk_file.read_text()) if risk_file.exists() else None
    found = {f"briefing/{t}": company_briefing(d) for t, d in companies.items()}
    found[f"briefing/portfolio/{key}"] = portfolio_briefing(_read(out, f"portfolio/{key}"), companies, market, risk, key)
    return found


def build(out: Path = SAVED) -> list[Path]:
    found = {path: briefing_json(b) for path, b in briefings(out).items()}
    failed = [f"{path}: {h['reason']}" for path, body in found.items() for h in body["panel"]["held_back"]
              if h["reason"].startswith("failed the check")]
    if failed:
        raise FailedCheck("Lines failed the check, nothing written:\n" + "\n".join(failed))
    written = []
    for path, body in found.items():
        f = out / f"{path}.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(body, separators=(",", ":")))
        written.append(f)
    return written
