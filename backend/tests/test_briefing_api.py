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


def test_the_briefing_says_precedence_never_stone(client):
    """The product is Precedence on screen and the briefing is read aloud; `stone` is only the code's package name."""
    import json
    from stone.config import REPO_DIR
    holdings = [{"symbol": "HLCN", "shares": 10}, {"symbol": "BRD500", "shares": 2}]
    live = [client.get("/api/briefing/HLCN").json(), client.post("/api/briefing/portfolio", json={"holdings": holdings}).json()]
    assert all(b["generated_by"].startswith("Precedence expert panel") for b in live)
    saved = [p.read_text() for p in (REPO_DIR / "frontend" / "public" / "saved").rglob("*.json")]
    assert saved and not [t for t in [json.dumps(b) for b in live] + saved if "Stone" in t]


def test_portfolio_briefing_counts_the_home_and_the_401k_like_the_board(client):
    """The judge's case: with a home and a 401(k) saved, the Briefing said "your 3 holdings are worth $4,746" while
    /portfolio said "Everything you own $1,346,740, includes a home estimate"."""
    other = [{"kind": "retirement", "fund": "FXAIX", "amount": 12000, "account": "401(k)"},
             {"kind": "property", "label": "Home", "paid": 300000, "bought_year": 2015, "estimate": 600000,
              "source": "FHFA", "as_of": "2025"}]
    holdings = [{"symbol": "HLCN", "shares": 10}]
    board = client.post("/api/portfolio", json={"holdings": holdings, "other": other}).json()
    assert board["subtotals"]["total"] == pytest.approx(612280.6) and board["retirement"][0]["state"] == "WATCH"
    body = client.post("/api/briefing/portfolio", json={"holdings": holdings, "other": other}).json()
    spoken_ok(body)
    t = [line["text"] for line in body["lines"]]
    assert t[0] == ("Here is your Precedence briefing for Friday, September 25: everything you own is about "
                    "$612,281, including a home estimate.")  # the board's own total, home and 401(k) included
    assert t[1] == "Your 1 brokerage holding is worth $280.60, up 1.1% on the day."  # not the 401(k)'s dollars
    assert t[2] == "Halcyon Semiconductor and Fidelity 500 Index Fund need a look."  # the 401(k) counted, as on /portfolio
    # without them, the greeting is the old one: the holdings alone
    plain = [line["text"] for line in client.post("/api/briefing/portfolio", json={"holdings": holdings}).json()["lines"]]
    assert plain[0] == "Here is your Precedence briefing for Friday, September 25: your 1 holding is worth $280.60, up 1.1% on the day."
    assert plain[1] == "Halcyon Semiconductor needs a look today." or "Fidelity" not in plain[1]
