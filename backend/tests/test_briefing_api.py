"""The briefing endpoints on the fictional sample data, through the same responses the pages use."""

import os
from datetime import date

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.briefing.lines import MAX_WORDS  # noqa: E402
from stone.ingest import sample  # noqa: E402


@pytest.fixture(scope="module")
def client():
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.close()
    return TestClient(app)


def spoken_ok(body: dict) -> None:
    assert body["lines"] and not [h for h in body["panel"]["held_back"] if h["reason"].startswith("failed")]
    for line in body["lines"]:
        assert len(line["text"].split()) <= MAX_WORDS and line["cites"] and line["tone"] in ("calm", "watch", "note")


def test_company_briefing_follows_the_company_page(client):
    page = client.get("/api/companies/hlcn").json()
    body = client.get("/api/briefing/hlcn").json()
    assert body["ticker"] == "HLCN" and body["as_of"] == page["last"]["day"]
    spoken_ok(body)
    name = page["company"]["name"]
    assert body["lines"][1]["text"] == (f"{name} needs a look today." if page["state"] == "WATCH"
                                        else f"{name} is calm: nothing happening now has mattered here before.")
    assert client.get("/api/briefing/NOPE").status_code == 404


def test_portfolio_briefing_names_every_heads_up(client):
    holdings = [{"symbol": "HLCN", "shares": 10}, {"symbol": "brd500", "shares": 2}, {"symbol": "ORCA", "shares": 5}]
    board = client.post("/api/portfolio", json={"holdings": holdings}).json()
    body = client.post("/api/briefing/portfolio", json={"holdings": holdings}).json()
    assert body["key"] == "BRD500-2_HLCN-10_ORCA-5" and body["as_of"] == board["price_as_of"]
    spoken_ok(body)
    watch = [e["name"] for e in board["exposure"] if e["state"] == "WATCH" and e["symbol"] in {"HLCN", "BRD500", "ORCA"}]
    assert all(name in body["lines"][1]["text"] for name in watch) or not watch
