import json
import os
from datetime import date

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.api.views import vs_market_words  # noqa: E402
from stone.ingest import sample  # noqa: E402


@pytest.fixture
def conn():
    c = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(c)
    sample.seed(c, date(2026, 9, 26))  # last trading day 2026-09-25; HLCN's 5-day window starts 2026-09-21
    yield c
    c.close()


@pytest.fixture
def client(conn):
    return TestClient(app)


def closes(conn, ticker, *days):
    rows = conn.execute("select day, close from prices_daily where ticker = %s and day = any(%s)",
                        (ticker, list(days))).fetchall()
    return {r["day"]: float(r["close"]) for r in rows}


def test_vs_market_says_how_big_the_move_was_next_to_the_market():
    assert vs_market_words(0.012, 0.010) == "with the market"
    assert vs_market_words(-0.015, -0.010) == "with the market"  # exactly half a point apart still counts
    assert vs_market_words(-0.035, -0.030) == "with the market"  # also half a point, though the float says 0.0050000001
    assert vs_market_words(0.016, 0.010) == "more than the market"  # 0.6 of a point is outside the band
    assert vs_market_words(-0.030, -0.010) == "more than the market"  # fell further
    assert vs_market_words(0.020, 0.005) == "more than the market"
    assert vs_market_words(0.001, -0.015) == "less than the market"
    assert vs_market_words(None, 0.01) is None and vs_market_words(0.01, None) is None


def test_the_day_move_is_the_last_close_against_the_one_before_and_the_market_on_the_same_day(client, conn):
    body = client.get("/api/companies/hlcn/today").json()
    assert body["ticker"] == "HLCN" and body["as_of"] == "2026-09-25"
    own = closes(conn, "HLCN", date(2026, 9, 24), date(2026, 9, 25))
    mkt = closes(conn, "BRD500", date(2026, 9, 24), date(2026, 9, 25))
    assert body["day_change"] == round(own[date(2026, 9, 25)] - own[date(2026, 9, 24)], 4)  # no float noise
    assert body["day_change_pct"] == pytest.approx(own[date(2026, 9, 25)] / own[date(2026, 9, 24)] - 1)
    assert body["market_symbol"] == "BRD500"  # sample mode's stand-in for SPY
    assert body["spy_change_pct"] == pytest.approx(mkt[date(2026, 9, 25)] / mkt[date(2026, 9, 24)] - 1)
    assert body["vs_market"] == vs_market_words(body["day_change_pct"], body["spy_change_pct"])
    assert body["window"] == {"start": "2026-09-21", "end": "2026-09-25", "trading_days": 5,
                              "note": body["window"]["note"]}


def test_no_market_bar_that_day_means_no_comparison(client, conn):
    conn.execute("delete from prices_daily where ticker = 'BRD500' and day = '2026-09-25'")
    conn.commit()
    body = client.get("/api/companies/HLCN/today").json()
    assert body["day_change_pct"] is not None
    assert body["spy_change_pct"] is None and body["vs_market"] is None and body["same_direction"] is None


def test_events_are_only_the_last_five_trading_days(client, conn):
    for acc, form, when in (("TEST-8K-IN", "8-K", "2026-09-22 16:30-04"), ("TEST-10Q-OUT", "10-Q", "2026-09-18 16:30-04")):
        conn.execute("insert into filings values (%s, 'HLCN', %s, %s::date, %s, null, 'doc.htm', 'sample')",
                     (acc, form, when[:10], when))
    conn.commit()
    ev = client.get("/api/companies/HLCN/today").json()["events"]
    assert [(f["form"], f["accepted_at"][:10]) for f in ev["filings"]] == [("8-K", "2026-09-22")]
    assert all(f["url"] is None for f in ev["filings"])  # sample filings never link to sec.gov
    # Form 4 sales on 09-17 (outside), 09-21 and 09-23 (inside); the Form 4s themselves aren't listed as filings
    assert sorted(s["accepted_at"][:10] for s in ev["insider_sales"]) == ["2026-09-21", "2026-09-23"]
    r = ev["rate_move"]
    assert (r["from_day"], r["from_value"], r["to_day"], r["to_value"]) == ("2026-09-18", 4.1, "2026-09-25", 4.31)
    assert r["change"] == pytest.approx(0.21)
    firing = {s["signal"]: s for s in ev["signals_firing"]}
    assert firing["insider_cluster"]["in_window"] is True and firing["insider_cluster"]["lite"] == "Insiders sold shares"


def test_insider_sales_are_null_not_empty_when_form4s_are_not_loaded(client):
    assert client.get("/api/companies/MRDN/today").json()["events"]["insider_sales"] is None


def test_facts_and_sources_only_never_a_cause(client):
    body = client.get("/api/companies/HLCN/today").json()
    assert set(body) == {"ticker", "name", "legal_name", "as_of", "close", "prev_close", "day_change", "day_change_pct",
                         "market_symbol", "spy_change_pct", "vs_market", "same_direction", "window", "events",
                         "sources"}
    text = json.dumps(body).lower()
    assert not any(w in text for w in ("because", "due to", "caused", "driven by", "why"))
    s = body["sources"]
    assert s["prices"]["source"] == "sample" and s["prices"]["as_of"] == "2026-09-25"
    assert s["rate"]["series"] == "DGS10" and s["market"]["symbol"] == "BRD500"


def test_unknown_company_today_is_404(client):
    assert client.get("/api/companies/NOPE/today").status_code == 404
