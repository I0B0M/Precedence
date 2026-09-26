import os
from datetime import date

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.ingest import sample  # noqa: E402


@pytest.fixture(scope="module")
def client():
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.close()
    return TestClient(app)


def test_status_says_sample(client):
    assert client.get("/api/status").json()["data"] == "sample"


def test_company_screen_has_every_part(client):
    body = client.get("/api/companies/hlcn").json()
    assert body["company"]["ticker"] == "HLCN"
    assert len(body["prices"]) == 504 and body["last"]["day"] == "2026-09-25"
    assert {s["signal"] for s in body["signals"]} == {"insider_cluster", "rate_jump", "gap_down"}
    assert body["state"] == "WATCH"
    assert {f["key"] for f in body["facts"]} >= {"revenue", "net_income", "assets"}
    assert body["insider_sales"] and body["filings"] and body["rate"]
    assert all(f["url"] is None for f in body["filings"])  # sample filings never link to sec.gov


def test_unknown_company_is_404(client):
    assert client.get("/api/companies/NOPE").status_code == 404


def test_signal_lab_returns_cases(client):
    body = client.get("/api/lab/MRDN/rate_jump").json()
    assert body["label"] == "STRONG" and len(body["cases"]) == body["n"] == 12
    h = body["holdout"]
    assert h["first"]["n"] + h["second"]["n"] == 12 and isinstance(h["held_up"], bool)
    assert client.get("/api/lab/ORCA/gap_down").json()["holdout"] is None  # only STRONG gets one
    assert client.get("/api/lab/MRDN/moon_phase").status_code == 404
    assert client.get("/api/lab/BRD500/gap_down").status_code == 400


def test_portfolio_counts_etf_slices_and_orders_watch_first(client):
    body = client.post("/api/portfolio", json={"holdings": [
        {"symbol": "orca", "shares": 30}, {"symbol": "HLCN", "shares": 62},
        {"symbol": "BRD500", "shares": 12}, {"symbol": "ZZZZ", "shares": 1}]}).json()
    assert body["unknown"] == ["ZZZZ"]
    ex = {e["symbol"]: e for e in body["exposure"]}
    brd = next(r for r in body["rows"] if r["symbol"] == "BRD500")["value"]
    assert ex["HLCN"]["via_etf"]["BRD500"] == pytest.approx(brd * 0.041)
    assert ex["MRDN"]["direct"] == 0 and ex["MRDN"]["total"] > 0  # only via the fund
    assert body["exposure"][0]["state"] == "WATCH"
    assert ex["HLCN"]["bad_day_loss"] < 0


def test_reconcile_endpoint(client):
    body = client.post("/api/import/reconcile", json={
        "rows": [{"symbol": "brve", "shares": 85, "price": 12.5, "value": 687.5}], "printed_total": 687.5}).json()
    assert body["status"] == "fixable" and body["rows"][0]["fix"] == {"shares": 55}


def test_screenshot_import_says_not_connected_without_key(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    r = client.post("/api/import/screenshot", files={"file": ("s.png", b"\x89PNG", "image/png")})
    assert r.status_code == 503 and "isn't connected yet" in r.json()["detail"]


def test_scan_is_empty_until_a_scan_runs(client):
    conn = db.connect(os.environ["DATABASE_URL"])
    conn.execute("delete from signal_scans")
    conn.commit()
    assert client.get("/api/scan").json() is None
