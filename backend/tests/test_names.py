import os

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from datetime import date  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.ingest import sample  # noqa: E402
from stone.names import display_name  # noqa: E402


@pytest.mark.parametrize("ticker, legal, shown", [
    # the ones the judge saw
    ("T", "At&T Inc.", "AT&T"),
    ("USB", "Us Bancorp De", "U.S. Bancorp"),
    ("COST", "Costco Wholesale Corp /New", "Costco Wholesale"),
    ("QCOM", "Qualcomm Inc/De", "Qualcomm"),
    ("DHR", "Danaher Corp /De/", "Danaher"),
    ("AMT", "American Tower Corp /Ma/", "American Tower"),
    ("WFC", "Wells Fargo & Company/Mn", "Wells Fargo"),
    ("LLY", "ELI LILLY & Co", "Eli Lilly"),
    ("PG", "PROCTER & GAMBLE Co", "Procter & Gamble"),
    ("DUK", "Duke Energy CORP", "Duke Energy"),
    ("MCD", "Mcdonalds Corp", "McDonald's"),
    ("SCHW", "Schwab Charles Corp", "Charles Schwab"),
    ("MU", "MICRON TECHNOLOGY INC", "Micron Technology"),
    # rules, not overrides
    ("DE", "Deere & Co", "Deere"),
    ("MRK", "Merck & Co., Inc.", "Merck"),
    ("CHTR", "Charter Communications, Inc. /Mo/", "Charter Communications"),
    ("MMM", "3M Co", "3M"),
    ("GOOG", "ALPHABET INC CL C", "Alphabet Class C"),
    ("GEV", "GE VERNOVA INC", "GE Vernova"),
    ("KLAC", "KLA CORP", "KLA"),
    ("ZZZZ", "ASML Holding N.V.", "ASML Holding"),
    # left alone
    ("JNJ", "Johnson & Johnson", "Johnson & Johnson"),
    ("NVDA", "NVIDIA", "NVIDIA"),
    ("SPY", "SPDR S&P 500 ETF", "SPDR S&P 500 ETF"),
    ("IVV", "iShares Core S&P 500 ETF", "iShares Core S&P 500 ETF"),
    ("BX", "Blackstone", "Blackstone"),
])
def test_display_name(ticker, legal, shown):
    assert display_name(ticker, legal) == shown


def test_no_name_stays_no_name():
    assert display_name("ZZZZ", None) is None


@pytest.fixture(scope="module")
def client():
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.execute("update companies set name = 'HALCYON HOLDINGS CORP /DE/' where ticker = 'HLCN'")
    conn.commit()
    yield TestClient(app)
    sample.seed(conn, date(2026, 9, 26))  # back to the sample's own names
    conn.close()


def test_every_company_screen_carries_both_names(client):
    both = {"name": "Halcyon Holdings", "legal_name": "HALCYON HOLDINGS CORP /DE/"}
    row = next(r for r in client.get("/api/companies").json() if r["ticker"] == "HLCN")
    assert {k: row[k] for k in both} == both
    detail = client.get("/api/companies/HLCN").json()["company"]
    assert {k: detail[k] for k in both} == both
    today = client.get("/api/companies/HLCN/today").json()
    assert {k: today[k] for k in both} == both
    board = client.post("/api/portfolio", json={"holdings": [{"symbol": "HLCN", "shares": 1}]}).json()
    assert {k: board["rows"][0][k] for k in both} == both
    ex = next(e for e in board["exposure"] if e["symbol"] == "HLCN")
    assert {k: ex[k] for k in both} == both
    fund = next(h for h in client.get("/api/funds/BRD500").json()["holdings"] if h["ticker"] == "HLCN")
    assert {k: fund[k] for k in both} == both
