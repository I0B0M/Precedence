"""Export real API responses as JSON fixtures, for building or comparing a UI offline.

    uv run python scripts/export_fixtures.py BX AAPL NVDA JPM XOM

Writes frontend/fixtures/. Refuses to run if any sample rows are in the database.
Every file is {"meta": {...source, as_of...}, "data": <exact API response>}.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from stone import db
from stone.api.main import app
from stone.config import REPO_DIR
from stone.signals import engine

OUT = REPO_DIR / "frontend" / "fixtures"
tickers = [t.upper() for t in sys.argv[1:]] or ["BX"]

conn = db.connect()
if conn.execute("select count(*) as n from companies where source = 'sample'").fetchone()["n"]:
    sys.exit("Sample rows are in the database. Run scripts/seed_sample.py --clear first.")
as_of = conn.execute("select max(day) as d from prices_daily").fetchone()["d"].isoformat()
sources = [r["source"] for r in conn.execute(
    """select distinct source from (select source from filings union select source from prices_daily
       union select source from rates union select source from insider_trades) s order by 1""").fetchall()]
generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
client = TestClient(app)


def write(path: Path, endpoint: str, data, note: str | None = None) -> None:
    meta = {"endpoint": endpoint, "as_of": as_of, "generated_at": generated, "sources": sources}
    if note:
        meta["note"] = note
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"meta": meta, "data": data}, indent=2))
    print(f"wrote {path.relative_to(REPO_DIR)}")


def get(url: str):
    resp = client.get(url)
    resp.raise_for_status()
    return resp.json()


for t in tickers:
    write(OUT / t / "company.json", f"GET /api/companies/{t}", get(f"/api/companies/{t}"))
    for key in engine.SPECS:
        write(OUT / t / f"lab_{key}.json", f"GET /api/lab/{t}/{key}", get(f"/api/lab/{t}/{key}"))

write(OUT / "market_rate_jump.json", "GET /api/market/rate_jump", get("/api/market/rate_jump"))

# Example holdings: real prices and signals; the share counts are illustrative, not anyone's portfolio.
holdings = [{"symbol": t, "shares": 10} for t in tickers] + [{"symbol": "SPY", "shares": 5}]
resp = client.post("/api/portfolio", json={"holdings": holdings})
resp.raise_for_status()
write(OUT / "holdings.json", "POST /api/portfolio", {"request": {"holdings": holdings}, "response": resp.json()},
      note="Share counts are illustrative (10 of each stock, 5 SPY). Prices and signals are real.")

# Reconcile example: the request is a made-up screenshot read with one misread share count.
bx = get("/api/companies/BX")["last"]["close"]
rows = [{"symbol": "BX", "shares": 85, "price": bx, "value": round(55 * bx, 2)}]
body = {"rows": rows, "printed_total": round(55 * bx, 2)}
resp = client.post("/api/import/reconcile", json=body)
resp.raise_for_status()
write(OUT / "reconcile_example.json", "POST /api/import/reconcile", {"request": body, "response": resp.json()},
      note="Example input: a screenshot read where 55 shares was misread as 85. BX price is real.")
