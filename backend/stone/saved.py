"""The saved demo data (frontend/public/saved) with what the live API sends now, rebuilt from the
saved files themselves, no network: each signal's `strict` (the stricter test Pro shows as the
evidence behind "borderline") and each hold-out's verdict under the current rule (10+ cases a half).

    uv run python scripts/saved_strict.py      # rewrites frontend/public/saved in place

scripts/build_saved.py calls finish() last, so a rebuild keeps both. Running it twice changes nothing.
"""

import json
from pathlib import Path

from stone.api.views import holdout_from_saved, with_strict
from stone.config import REPO_DIR

SAVED = REPO_DIR / "frontend" / "public" / "saved"


def _read(p: Path):
    return json.loads(p.read_text())


def _write(p: Path, data) -> None:
    p.write_text(json.dumps(data, separators=(",", ":")))


def finish(out: Path = SAVED) -> None:
    companies = {p.stem: _read(p) for p in sorted((out / "companies").glob("*.json"))}
    days = {t: [x["day"] for x in c["prices"]] for t, c in companies.items() if c["company"]["kind"] == "stock"}
    calendar = next(iter(days.values()))  # the stocks share one calendar; each rebuild checks it by the normal-day count
    full: dict[tuple[str, str], dict] = {}  # (symbol, signal) -> with strict, for the saved lists that carry no cases

    for t, c in companies.items():
        c["signals"] = [with_strict(s, days.get(t, calendar)) for s in c["signals"]]
        full.update({(t, s["signal"]): s for s in c["signals"]})
        _write(out / "companies" / f"{t}.json", c)
    for p in sorted((out / "lab").glob("*/*.json")):
        r = with_strict(_read(p), days.get(p.parent.name, calendar))
        full.setdefault((p.parent.name, r["signal"]), r)
        _write(p, r)
    market = out / "market" / "rate_jump.json"
    if market.exists():
        m = with_strict(_read(market), calendar)
        full.setdefault((m.get("symbol", "SPY"), m["signal"]), m)
        _write(market, m)

    def light(symbol: str, r: dict) -> dict:
        """A board or fund-page entry: the same result saved without its cases, so strict comes from the full one."""
        f = full.get((symbol, r["signal"]))
        return {**r, "strict": f["strict"] if f else None, "holdout": holdout_from_saved(r.get("holdout"))}

    for p in sorted((out / "portfolio").glob("*.json")):  # the board; portfolio/risk/ holds no signals
        board = _read(p)
        for e in board["exposure"]:
            e["firing"] = [light(e["symbol"], r) for r in e["firing"]]
        _write(p, board)
    for p in sorted((out / "funds").glob("*.json")):
        fund = _read(p)
        fund["fund_firing"] = [light(fund["symbol"], r) for r in fund["fund_firing"]]
        _write(p, fund)
