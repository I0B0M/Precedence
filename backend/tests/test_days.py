import os
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.ingest import sample  # noqa: E402

ET = ZoneInfo("America/New_York")


@pytest.fixture(scope="module")
def client():
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.close()
    return TestClient(app)


def test_worst_and_best_days_come_from_the_stock_s_own_closes(client):
    body = client.get("/api/companies/HLCN").json()
    days, closes = body["days"], [(p["day"], p["close"]) for p in body["prices"]]
    moves = sorted((c / pc - 1, d) for (_, pc), (d, c) in zip(closes, closes[1:]))
    assert [x["day"] for x in days["worst"]] == [d for _, d in moves[:3]]  # biggest falls first
    assert [x["day"] for x in days["best"]] == [d for _, d in moves[::-1][:3]]  # biggest rises first
    for x in days["worst"] + days["best"]:
        i = next(k for k, (d, _) in enumerate(closes) if d == x["day"])
        assert x["close"] == closes[i][1] and x["prev_close"] == closes[i - 1][1]
        assert x["change_pct"] == pytest.approx(x["close"] / x["prev_close"] - 1)
    assert days["window_days"] == 5 and "daily closes" in days["basis"]


def test_each_day_lists_what_was_known_in_the_five_trading_days_up_to_its_close(client):
    body = client.get("/api/companies/HLCN").json()
    trading = [p["day"] for p in body["prices"]]
    for x in body["days"]["worst"] + body["days"]["best"]:
        i = trading.index(x["day"])
        start = datetime.combine(date.fromisoformat(trading[max(0, i - 4)]), time(0), tzinfo=ET)
        end = datetime.combine(date.fromisoformat(x["day"]), time(16), tzinfo=ET)
        for e in x["events"]:
            when = datetime.fromisoformat(e.get("accepted_at") or e["known_at"])
            assert start <= when <= end, (x["day"], e)  # known before that close, never after it
            assert e["kind"] in ("filing", "insider_sale", "rate_jump")
    # the sample plants insider sales; any day whose window holds one must list it
    sales = [s for s in body["insider_sales"]]
    for x in body["days"]["worst"] + body["days"]["best"]:
        i = trading.index(x["day"])
        lo, hi = trading[max(0, i - 4)], x["day"]
        expected = {s["accession"] for s in sales
                    if lo <= datetime.fromisoformat(s["accepted_at"]).astimezone(ET).date().isoformat() <= hi
                    and datetime.fromisoformat(s["accepted_at"]) <= datetime.combine(date.fromisoformat(hi), time(16), tzinfo=ET)}
        got = {e["accession"] for e in x["events"] if e["kind"] == "insider_sale"}
        assert expected <= got, x["day"]


def test_the_window_is_exactly_the_five_trading_days_up_to_the_close(client):
    body = client.get("/api/companies/HLCN").json()
    trading = [p["day"] for p in body["prices"]]
    worst = body["days"]["worst"][0]
    i = trading.index(worst["day"])
    first, before = trading[i - 4], trading[i - 5]
    assert worst["window_start"] == first
    conn = db.connect(os.environ["DATABASE_URL"])
    rows = (("TEST-DAYS-IN", first), ("TEST-DAYS-OUT", before))  # 9am on the window's first day, and the day before it
    for acc, day in rows:
        conn.execute("insert into filings values (%s, 'HLCN', '8-K', %s, %s, null, 'x.htm', 'sample')",
                     (acc, day, datetime.combine(date.fromisoformat(day), time(9), tzinfo=ET)))
    conn.commit()
    try:
        again = client.get("/api/companies/HLCN").json()["days"]["worst"][0]
        forms = [e["accepted_at"][:10] for e in again["events"] if e["kind"] == "filing"]
        assert first in forms and before not in forms
    finally:
        conn.execute("delete from filings where accession like 'TEST-DAYS-%'")
        conn.commit()


def test_a_fund_gets_days_too_with_no_company_filings(client):
    days = client.get("/api/companies/BRD500").json()["days"]
    assert len(days["worst"]) == 3 and len(days["best"]) == 3
    assert all(e["kind"] == "rate_jump" for x in days["worst"] + days["best"] for e in x["events"])
