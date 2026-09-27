import os
from datetime import date, timedelta

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
    assert h["verdict"] == "too few cases to check" and h["held_up"] is False  # 12 cases can't fill two halves of 10
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
    # MRDN is held only through the fund and is under 1% of everything, so it stays inside the fund
    assert "MRDN" not in ex and "MRDN" in {k["symbol"] for k in ex["BRD500"]["children"]}
    assert ex["BRD500"]["direct"] == pytest.approx(brd)  # you own the whole fund directly
    assert sum(e["total"] for e in body["exposure"]) == pytest.approx(body["total"])
    assert body["exposure"][0]["state"] == "WATCH"
    assert ex["HLCN"]["bad_day_loss"] < 0


def test_the_market_fund_is_tested_and_other_funds_have_no_state(client, monkeypatch):
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "BRD500", "shares": 10}]}).json()
    fund = next(e for e in body["exposure"] if e["symbol"] == "BRD500")
    market = client.get("/api/market/rate_jump").json()
    expected = "WATCH" if market["label"] == "STRONG" and market["firing"] else "CALM"
    assert fund["state"] == expected  # sample mode: BRD500 is the market
    assert [f["signal"] for f in fund["firing"]] == (["market_rate_jump"] if market["firing"] else [])

    from stone.signals import service
    monkeypatch.setattr(service, "MARKET_TICKERS", ("HLCN",))  # now BRD500 is just a fund we never tested
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "BRD500", "shares": 10}]}).json()
    assert next(e for e in body["exposure"] if e["symbol"] == "BRD500")["state"] is None


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


def test_rate_jump_is_judged_against_the_market(client):
    body = client.get("/api/lab/MRDN/rate_jump").json()
    assert body["vs_market"] is True
    assert all(isinstance(c["market_ret"], float) for c in body["cases"])
    assert all(c["hit"] == (c["ret"] - c["market_ret"] < 0) for c in body["cases"])
    gap = client.get("/api/lab/BRVE/gap_down").json()
    assert gap["vs_market"] is False and all(c["market_ret"] is None for c in gap["cases"])


def test_market_rate_jump_card_runs_on_the_market_itself(client):
    body = client.get("/api/market/rate_jump").json()
    assert body["symbol"] == "BRD500"  # sample mode: the sample index fund stands in for SPY
    assert body["signal"] == "market_rate_jump" and body["vs_market"] is False
    assert body["n"] == len(body["cases"]) > 0
    assert all(c["hit"] == (c["ret"] < 0) for c in body["cases"])


def test_no_market_prices_is_a_clear_503(client, monkeypatch):
    from stone.signals import service
    monkeypatch.setattr(service, "MARKET_TICKERS", ("NOPE",))
    r = client.get("/api/lab/MRDN/rate_jump")
    assert r.status_code == 503 and "No market prices" in r.json()["detail"]
    assert client.get("/api/lab/BRVE/gap_down").status_code == 200  # other signals don't need the market


def test_portfolio_says_where_fund_holdings_come_from_and_when(client):
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "BRD500", "shares": 10}]}).json()
    [fund] = body["funds"]
    assert fund["symbol"] == "BRD500" and fund["source"] == "sample" and fund["as_of"] == "2026-09-25"
    assert fund["looked_through"] == pytest.approx(0.066)  # share of the fund shown as its stocks


def test_fund_holdings_we_have_no_data_for_stay_in_the_fund(client):
    conn = db.connect(os.environ["DATABASE_URL"])
    as_of = conn.execute("select max(as_of) as d from etf_holdings where etf = 'BRD500'").fetchone()["d"]
    conn.execute("insert into etf_holdings values ('BRD500', 'ZZZZ', 0.5, %s, 'sample')", (as_of,))
    conn.commit()
    try:
        body = client.post("/api/portfolio", json={"holdings": [{"symbol": "BRD500", "shares": 10}]}).json()
        assert sum(e["total"] for e in body["exposure"]) == pytest.approx(body["total"])
        assert "ZZZZ" not in {e["symbol"] for e in body["exposure"]}
        assert body["funds"][0]["looked_through"] == pytest.approx(0.066)  # ZZZZ isn't shown, so isn't counted
    finally:
        conn.execute("delete from etf_holdings where holding = 'ZZZZ'")
        conn.commit()


def test_portfolio_says_which_close_the_prices_are_from(client):
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "HLCN", "shares": 1}]}).json()
    assert body["price_as_of"] == "2026-09-25"
    assert client.post("/api/portfolio", json={"holdings": []}).json()["price_as_of"] is None


def test_the_market_fund_page_carries_the_same_state_as_the_board(client, monkeypatch):
    page = client.get("/api/companies/BRD500").json()
    board = client.post("/api/portfolio", json={"holdings": [{"symbol": "BRD500", "shares": 10}]}).json()
    fund = next(e for e in board["exposure"] if e["symbol"] == "BRD500")
    assert page["state"] == fund["state"] and page["state"] in ("CALM", "WATCH")
    assert [s["signal"] for s in page["signals"]] == ["market_rate_jump"] and page["signals"][0]["cases"]

    from stone.signals import service
    monkeypatch.setattr(service, "MARKET_TICKERS", ("HLCN",))  # BRD500 becomes a fund we never tested
    page = client.get("/api/companies/BRD500").json()
    assert page["state"] is None and page["signals"] == []


def test_today_counts_the_last_trading_day_from_the_database(client):
    conn = db.connect(os.environ["DATABASE_URL"])
    day, at = date(2026, 9, 25), "2026-09-25 18:00-04"
    rows = [("T-HLCN-8K", "HLCN", "8-K"), ("T-HLCN-4", "HLCN", "4"), ("T-ORCA-4", "ORCA", "4")]
    for acc, t, form in rows:
        conn.execute("insert into filings values (%s, %s, %s, %s, %s, null, null, 'sample')", (acc, t, form, day, at))
    # only HLCN's Form 4 has parsed lines, so only it is known to be about HLCN (not HLCN selling someone else's stock)
    conn.execute("insert into insider_trades values ('T-HLCN-4', 0, 'HLCN', 'X', null, %s, 'S', 1, 1, 'D', %s, 'sample')",
                 (day, at))
    conn.commit()
    try:
        body = client.get("/api/today?symbols=hlcn,ORCA,BRD500,ZZZZ").json()
        assert body["day"] == "2026-09-25"
        f = body["market"]["filings"]
        assert f["count"] == 2 and f["by_form"] == {"8-K": 1, "4": 1} and f["as_of"] == "2026-09-25"
        assert body["market"]["rate"]["day"] == "2026-09-25" and body["market"]["rate"]["source"] == "sample"
        h = body["holdings"]
        assert h["symbols"] == ["HLCN", "ORCA", "BRD500"] and h["unknown"] == ["ZZZZ"]
        assert h["filings"]["count"] == 2 and {i["ticker"] for i in h["filings"]["items"]} == {"HLCN"}
        page = {s: client.get(f"/api/companies/{s}").json() for s in ("HLCN", "ORCA", "BRD500")}
        firing = [(s, x["signal"], x["label"]) for s, p in page.items() for x in p["signals"] if x["firing"]]
        assert h["signals"]["firing"] == len(firing)
        assert h["signals"]["strong_firing"] == sum(1 for *_, lab in firing if lab == "STRONG") >= 1  # HLCN is WATCH
    finally:
        conn.execute("delete from insider_trades where accession = 'T-HLCN-4'")
        conn.execute("delete from filings where accession like 'T-%'")
        conn.commit()


def test_today_without_holdings_has_only_the_market(client):
    body = client.get("/api/today").json()
    assert body["holdings"] is None and body["market"]["filings"]["source"] == "sample"


class FakeGemini:
    """Stands in for GeminiClient once a key is set, so the whole path to reconcile is tested."""
    def __init__(self, *_):
        pass

    def read_screenshot(self, image, mime):
        from stone.sources.gemini import ReadRow, ScreenshotRead
        return ScreenshotRead([ReadRow("BRVE", 85, 12.5, 687.5)], 687.5)


def test_screenshot_import_reads_then_reconciles_once_a_key_is_set(client, monkeypatch):
    import stone.api.main as m
    monkeypatch.setattr(m, "GeminiClient", FakeGemini)
    r = client.post("/api/import/screenshot", files={"file": ("s.png", b"\x89PNG....", "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "fixable" and body["rows"][0]["fix"] == {"shares": 55}


def test_screenshot_import_errors_are_plain(client, monkeypatch):
    import httpx

    import stone.api.main as m
    from stone.sources.gemini import ScreenshotUnreadable

    class Unreadable(FakeGemini):
        def read_screenshot(self, image, mime):
            raise ScreenshotUnreadable("Gemini blocked the image (SAFETY)")

    class Down(FakeGemini):
        def read_screenshot(self, image, mime):
            req = httpx.Request("POST", "https://generativelanguage.googleapis.com/x")
            raise httpx.HTTPStatusError("quota", request=req, response=httpx.Response(429, request=req))

    png = {"file": ("s.png", b"\x89PNG....", "image/png")}
    monkeypatch.setattr(m, "GeminiClient", Unreadable)
    r = client.post("/api/import/screenshot", files=png)
    assert r.status_code == 422 and "SAFETY" in r.json()["detail"]
    monkeypatch.setattr(m, "GeminiClient", Down)
    r = client.post("/api/import/screenshot", files=png)
    assert r.status_code == 502 and "429" in r.json()["detail"]
    monkeypatch.setattr(m, "GeminiClient", FakeGemini)
    assert client.post("/api/import/screenshot", files={"file": ("a.pdf", b"%PDF", "application/pdf")}).status_code == 415
    big = {"file": ("s.png", b"\x89PNG" + b"0" * (m.MAX_SCREENSHOT_BYTES + 1), "image/png")}
    assert client.post("/api/import/screenshot", files=big).status_code == 413


def test_today_has_a_week_block_next_to_the_day(client):
    before = client.get("/api/today?symbols=HLCN").json()  # the sample already has filings that week
    conn = db.connect(os.environ["DATABASE_URL"])
    rows = [("W-HLCN-8K", "HLCN", "8-K", date(2026, 9, 22), "2026-09-22 18:00-04"),
            ("W-ORCA-8K", "ORCA", "8-K", date(2026, 9, 25), "2026-09-25 18:00-04"),
            ("W-OLD-8K", "ORCA", "8-K", date(2026, 9, 18), "2026-09-18 18:00-04")]  # 8 days back: outside the week
    for acc, t, form, d, at in rows:
        conn.execute("insert into filings values (%s, %s, %s, %s, %s, null, null, 'sample')", (acc, t, form, d, at))
    conn.commit()
    try:
        body = client.get("/api/today?symbols=HLCN").json()
        w = body["week"]
        assert (w["start"], w["end"]) == ("2026-09-19", "2026-09-25")
        b = before["week"]["filings"]
        assert w["filings"]["count"] == b["count"] + 2  # the 22nd and the 25th, not the 18th
        assert w["filings"]["by_form"].get("8-K", 0) == b["by_form"].get("8-K", 0) + 2
        assert w["filings"]["as_of"] == "2026-09-25" and w["filings"]["source"] == "sample"
        assert body["market"]["filings"]["count"] == before["market"]["filings"]["count"] + 1  # day: only the 25th
        r = w["rate"]
        assert r["first_day"] >= "2026-09-19" and r["last_day"] <= "2026-09-25"
        assert r["change"] == pytest.approx(r["last_value"] - r["first_value"])
        assert isinstance(r["jumps"], list) and r["source"] == "sample"
        assert body["holdings"]["week_filings"]["count"] == before["holdings"]["week_filings"]["count"] + 1
    finally:
        conn.execute("delete from filings where accession like 'W-%'")
        conn.commit()


def test_insider_signal_says_no_data_when_filings_are_not_loaded(client):
    # sample mode loads Form 4s only for HLCN, like real data loads them only for 20 stocks
    r = client.get("/api/lab/ORCA/insider_cluster").json()
    assert r["label"] == "NO DATA" and r["n"] == 0 and r["firing"] is None
    assert "ORCA" in r["note"] and "not loaded" in r["note"]
    assert client.get("/api/lab/HLCN/insider_cluster").json()["label"] != "NO DATA"
    page = client.get("/api/companies/ORCA").json()
    assert next(s for s in page["signals"] if s["signal"] == "insider_cluster")["label"] == "NO DATA"
    assert next(s for s in page["signals"] if s["signal"] == "gap_down")["label"] != "NO DATA"  # prices are loaded


def test_fund_page_shows_whats_inside_how_its_doing_and_whats_next(client):
    f = client.get("/api/funds/brd500").json()
    assert f["symbol"] == "BRD500" and f["holdings_source"] == "sample" and f["holdings_as_of"] == "2026-09-25"
    assert f["total_holdings_count"] == 4 and f["looked_through_share"] == pytest.approx(0.066)
    weights = [h["weight"] for h in f["holdings"]]
    assert weights == sorted(weights, reverse=True) and f["holdings"][0]["ticker"] == "HLCN"
    hlcn = f["holdings"][0]
    assert hlcn["in_stone"] and hlcn["state"] == "WATCH" and hlcn["firing"] and hlcn["lite_line"]
    assert {h["ticker"] for h in f["heads_up"]} == {h["ticker"] for h in f["holdings"] if h["state"] == "WATCH"}
    board = client.post("/api/portfolio", json={"holdings": [{"symbol": "BRD500", "shares": 1}]}).json()
    assert f["fund_state"] == next(e for e in board["exposure"] if e["symbol"] == "BRD500")["state"]
    assert [s["signal"] for s in f["fund_firing"]] == ["market_rate_jump"]
    conn = db.connect(os.environ["DATABASE_URL"])
    close = [float(r["close"]) for r in conn.execute(
        "select close from prices_daily where ticker = 'BRD500' order by day").fetchall()]
    last_day = conn.execute("select max(day) as d from prices_daily where ticker = 'BRD500'").fetchone()["d"]
    assert f["price"]["last_close"] == close[-1] and f["price"]["as_of"] == last_day.isoformat()
    assert f["price"]["prev_close"] == close[-2] and f["price"]["change_1d"] == pytest.approx(close[-1] / close[-2] - 1)
    p = f["performance"]  # trading-day windows, the same the UI uses
    assert p["d30"] == pytest.approx(close[-1] / close[-22] - 1)
    assert p["d90"] == pytest.approx(close[-1] / close[-64] - 1)
    assert p["y1"] == pytest.approx(close[-1] / close[-253] - 1)
    assert p["as_of"] == last_day.isoformat() and "trading days" in p["basis"]
    assert f["filings_span"] == {"start": "2026-09-19", "end": "2026-09-25"}
    assert all(w["ticker"] in {h["ticker"] for h in f["holdings"]} for w in f["week_filings"])


def test_fund_page_for_a_fund_without_holdings_and_for_non_funds(client):
    conn = db.connect(os.environ["DATABASE_URL"])
    conn.execute("insert into companies (ticker, cik, name, sector, kind, source) values "
                 "('EMPTYF', null, 'Empty Fund', null, 'etf', 'sample') on conflict do nothing")
    conn.commit()
    try:
        f = client.get("/api/funds/EMPTYF").json()
        assert f["holdings"] == [] and f["total_holdings_count"] == 0 and "EMPTYF" in f["note"]
        assert f["price"] is None and f["performance"]["d30"] is None and f["fund_state"] is None
    finally:
        conn.execute("delete from companies where ticker = 'EMPTYF'")
        conn.commit()
    assert client.get("/api/funds/HLCN").status_code == 400
    assert client.get("/api/funds/NOPE").status_code == 404


class FakeSummarizer(FakeGemini):
    def summarize_filing(self, text, ticker, form, accession):
        from datetime import datetime, timezone

        from stone.sources.gemini import FilingRead
        read = FilingRead(
            "Sales grew. Profit held up. Debt went down. The company also bought back shares.",
            [{"label": "Revenue", "kind": "revenue", "text_value": "$5.0 billion", "value": 5.0e9,
              "period_end": "2026-02-25"},
             {"label": "Net income", "kind": "net_income", "text_value": "$431 million", "value": 4.31e8,
              "period_end": "2026-02-25"},
             {"label": "Trucks", "kind": "other", "text_value": "1,204", "value": 1204, "period_end": None}])
        return read, False, datetime(2026, 9, 26, 22, 0, tzinfo=timezone.utc)


def test_filing_summary_checks_every_figure_against_the_filings_xbrl(client, monkeypatch):
    import stone.api.main as m
    monkeypatch.setattr(m, "GeminiClient", FakeSummarizer)
    monkeypatch.setattr(m, "filing_text", lambda cik, accession, primary_doc, source: "the filing text")
    body = client.get("/api/filings/SAMPLE-ORCA-10-Q-6/summary").json()
    assert body["ticker"] == "ORCA" and body["form"] == "10-Q" and body["cached"] is False
    assert body["summary_lite"] == "Sales grew. Profit held up. Debt went down."  # at most 3 sentences
    rev, ni, other = body["figures"]
    assert rev["match"] is True and rev["concept"] == "us-gaap:Revenues" and rev["xbrl_value"] == 5_039_780_223
    assert ni["match"] is False and ni["xbrl_value"] == 422_401_137  # a mismatch is shown, never hidden
    assert other["match"] is None
    assert body["model"] and body["generated_at"].startswith("2026-09-26")


def test_filing_summary_errors(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    r = client.get("/api/filings/SAMPLE-ORCA-10-Q-6/summary")
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]
    assert client.get("/api/filings/NOPE-123/summary").status_code == 404
    assert client.get("/api/filings/SAMPLE-HLCN-4-121/summary").status_code == 400  # Form 4s aren't summarized


@pytest.fixture
def hpi_rows():
    """A few FHFA-shaped index values for Miami: ZIP 33133 starts in 2012, the county and state go back further."""
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    rows = [("zip5", "33133", 2012, 200.0), ("zip5", "33133", 2025, 500.0),
            ("county", "12086", 2005, 150.0), ("county", "12086", 2025, 450.0),
            ("state", "FL", 2005, 140.0), ("state", "FL", 2025, 350.0)]
    conn.cursor().executemany("insert into house_price_index values (%s, %s, %s, %s, 'test') on conflict do nothing",
                              rows)
    conn.commit()
    yield
    conn.execute("delete from house_price_index where source = 'test'")
    conn.commit()


def test_home_estimate_from_an_address_uses_the_zip_index(client, monkeypatch, hpi_rows):
    import stone.api.main as m
    from stone.sources.census import Geocode
    monkeypatch.setattr(m, "geocode_address", lambda a: Geocode("3500 PAN AMERICAN DR, MIAMI, FL, 33133",
                                                                  "33133", "12086", "FL"))
    e = client.post("/api/estimate/home", json={"address": "3500 Pan American Dr, Miami, FL",
                                                 "paid": 400000, "bought_year": 2012}).json()
    assert e["kind"] == "property" and e["located_by"] == "address" and e["state"] is None
    assert (e["zip"], e["county_fips"], e["us_state"]) == ("33133", "12086", "FL")
    assert e["estimate"] == pytest.approx(1_000_000) and e["index_change"] == pytest.approx(1.5)
    assert e["index_level"] == "zip5" and e["as_of"] == "2025" and e["geocoder"] == "US Census Geocoder"
    assert "ZIP" in e["source"] and e["method"] == "paid × FHFA ZIP5 index change"


def test_home_estimate_falls_back_to_county_and_zip_only_skips_the_geocoder(client, monkeypatch, hpi_rows):
    import stone.api.main as m
    from stone.sources.census import Geocode
    monkeypatch.setattr(m, "geocode_address", lambda a: Geocode("X", "33133", "12086", "FL"))
    e = client.post("/api/estimate/home", json={"address": "somewhere", "paid": 300000, "bought_year": 2005}).json()
    assert e["index_level"] == "county" and e["estimate"] == pytest.approx(900_000) and "county" in e["note"]
    assert "county" in e["source"].lower()

    def no_geocoder(a):
        raise AssertionError("the ZIP path must not geocode")
    monkeypatch.setattr(m, "geocode_address", no_geocoder)
    z = client.post("/api/estimate/home", json={"zip": "33133", "paid": 400000, "bought_year": 2012}).json()
    assert z["located_by"] == "zip" and z["address_matched"] is None and z["estimate"] == pytest.approx(1_000_000)
    after = client.post("/api/estimate/home", json={"zip": "33133", "paid": 400000, "bought_year": 2026}).json()
    assert after["estimate"] == 400000 and "2025" in after["note"]


def test_home_estimate_errors_are_plain(client, monkeypatch, hpi_rows):
    import stone.api.main as m
    monkeypatch.setattr(m, "geocode_address", lambda a: None)
    r = client.post("/api/estimate/home", json={"address": "nowhere", "paid": 1, "bought_year": 2012})
    assert r.status_code == 422 and "couldn't match" in r.json()["detail"]
    assert client.post("/api/estimate/home", json={"paid": 1, "bought_year": 2012}).status_code == 422
    assert client.post("/api/estimate/home", json={"zip": "3313", "paid": 1, "bought_year": 2012}).status_code == 422
    r = client.post("/api/estimate/home", json={"zip": "33133", "paid": 400000, "bought_year": 1990})
    assert r.status_code == 422 and "No FHFA index" in r.json()["detail"]  # never a guess


def test_portfolio_adds_a_401k_and_a_home_with_honest_subtotals(client):
    body = client.post("/api/portfolio", json={
        "holdings": [{"symbol": "HLCN", "shares": 10}],
        "other": [{"kind": "retirement", "fund": "FXAIX", "amount": 10000, "account": "401(k)"},
                  {"kind": "retirement", "fund": "VFIFX", "amount": 5000},
                  {"kind": "property", "label": "Home", "paid": 300000, "bought_year": 2015, "estimate": 600000,
                   "source": "FHFA", "as_of": "2025"}]}).json()
    hlcn = next(r for r in body["rows"] if r["symbol"] == "HLCN")["value"]
    s = body["subtotals"]
    assert s["investments"] == pytest.approx(hlcn) and s["retirement"] == 15000 and s["home_estimate"] == 600000
    assert s["total"] == pytest.approx(hlcn + 15000 + 600000) and s["includes_home_estimate"] is True
    fx, tdf = body["retirement"]
    market = client.get("/api/market/rate_jump").json()
    expected = "WATCH" if market["label"] == "STRONG" and market["firing"] else "CALM"
    assert fx["ticker"] == "FXAIX" and fx["match"] == "exact index" and fx["state"] == expected  # the S&P stand-in's state
    assert tdf["behaves_like"] is None and tdf["state"] is None  # target date: not tested
    # the mapped 401(k) joins the board through the market fund's holdings; the unmapped one and the home don't
    assert body["total"] == pytest.approx(hlcn + 10000)
    assert sum(e["total"] for e in body["exposure"]) == pytest.approx(body["total"])
    [home] = body["properties"]
    assert home["estimate"] == 600000 and home["state"] is None and home["kind"] == "property"


def test_a_close_stand_in_401k_fund_joins_the_board_but_gets_no_state(client):
    body = client.post("/api/portfolio", json={
        "holdings": [], "other": [{"kind": "retirement", "fund": "FSKAX", "amount": 8000}]}).json()
    [fs] = body["retirement"]
    assert fs["match"] == "close stand-in" and fs["state"] is None and "stand-in" in fs["note"]
    assert body["total"] == pytest.approx(8000)  # its dollars still show through the index fund's holdings
    row = next(e for e in body["exposure"] if e["symbol"] == "FSKAX")
    assert row["state"] is None


def test_portfolio_without_other_rows_has_zero_subtotals_for_them(client):
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "HLCN", "shares": 1}]}).json()
    assert body["retirement"] == [] and body["properties"] == []
    assert body["subtotals"]["retirement"] == 0 and body["subtotals"]["includes_home_estimate"] is False


def test_an_etf_that_tracks_the_same_index_reuses_that_funds_holdings(client, monkeypatch):
    import stone.api.main as m
    monkeypatch.setattr(m, "HOLDINGS_FROM", {"ALIASF": "BRD500"})
    conn = db.connect(os.environ["DATABASE_URL"])
    conn.execute("insert into companies (ticker, cik, name, sector, kind, source) values "
                 "('ALIASF', null, 'Alias Fund', 'Index', 'etf', 'sample') on conflict do nothing")
    conn.execute("insert into prices_daily (ticker, day, open, high, low, close, volume, source) values "
                 "('ALIASF', '2026-09-24', 100, 100, 100, 100, 0, 'sample'), "
                 "('ALIASF', '2026-09-25', 100, 100, 100, 100, 0, 'sample') on conflict do nothing")
    conn.commit()
    try:
        body = client.post("/api/portfolio", json={"holdings": [{"symbol": "ALIASF", "shares": 100}]}).json()
        [info] = body["funds"]
        assert info["holdings_from"] == "BRD500" and info["looked_through"] == pytest.approx(0.066)
        assert "BRD500" in info["note"]
        assert sum(e["total"] for e in body["exposure"]) == pytest.approx(10_000)
        page = client.get("/api/funds/ALIASF").json()
        assert page["total_holdings_count"] == 4 and page["holdings"][0]["ticker"] == "HLCN"
        # same index as the market fund, so the market fund's test applies (like VOO and SPY)
        market_state = client.get("/api/companies/BRD500").json()["state"]
        alias_row = next(e for e in body["exposure"] if e["symbol"] == "ALIASF")
        assert alias_row["state"] == market_state and market_state in ("CALM", "WATCH")
        assert client.get("/api/companies/ALIASF").json()["state"] == market_state
        assert page["fund_state"] == market_state and "test applies" in info["note"]
    finally:
        conn.execute("delete from prices_daily where ticker = 'ALIASF'")
        conn.execute("delete from companies where ticker = 'ALIASF'")
        conn.commit()


def test_a_renamed_ticker_is_valued_under_its_current_symbol(client, monkeypatch):
    import stone.api.main as m
    monkeypatch.setattr(m, "RENAMED", {"OLDH": "HLCN"})  # like SPLG -> SPYM on 2025-10-31
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "oldh", "shares": 1}]}).json()
    [row] = body["rows"]
    assert row["symbol"] == "HLCN" and row["renamed_from"] == "OLDH" and body["unknown"] == []


def test_fund_lookup_endpoint(client):
    f = client.get("/api/funds/lookup?q=fxaix").json()
    assert f["query"] == "fxaix" and f["ticker"] == "FXAIX" and f["behaves_like"] == "SPY"
    assert client.get("/api/funds/lookup?q=VBTLX").json()["behaves_like"] is None


def test_status_says_whether_summaries_can_run_so_pages_can_skip_the_call(client, monkeypatch):
    acc = db.connect(os.environ["DATABASE_URL"]).execute(
        "select accession from filings where form = '10-Q' limit 1").fetchone()["accession"]
    monkeypatch.setenv("GEMINI_API_KEY", "")
    s = client.get("/api/status").json()
    assert s["summaries"] is False and s["screenshots"] is False
    r = client.get(f"/api/filings/{acc}/summary")
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]  # the same rule the flag reports
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-real")
    s = client.get("/api/status").json()
    assert s["summaries"] is True and s["screenshots"] is True


def test_fund_page_names_holdings_we_dont_track_from_the_issuers_file(client):
    from stone.ingest import store
    conn = db.connect(os.environ["DATABASE_URL"])
    as_of = conn.execute("select max(as_of) as d from etf_holdings where etf = 'BRD500'").fetchone()["d"]
    store.upsert_etf_holdings(conn, "BRD500", as_of, {"ZZZZ": 0.02, "HLCN": 0.041}, "sample",
                              {"ZZZZ": "ZED CORP CL A", "HLCN": "HALCYON ISSUER NAME"})
    store.upsert_etf_holdings(conn, "BRD500", as_of, {"ZZZZ": 0.02}, "sample")  # a later file without names
    conn.commit()
    try:
        by = {h["ticker"]: h for h in client.get("/api/funds/BRD500").json()["holdings"]}
        assert by["ZZZZ"]["legal_name"] == "ZED CORP CL A" and by["ZZZZ"]["in_stone"] is False  # kept, not wiped
        assert by["ZZZZ"]["name"] == "Zed Class A"  # cleaned for display
        tracked = conn.execute("select name from companies where ticker = 'HLCN'").fetchone()["name"]
        assert by["HLCN"]["legal_name"] == tracked  # a stock we track keeps its own name, not the issuer's
    finally:
        conn.execute("delete from etf_holdings where holding = 'ZZZZ'")
        conn.execute("update etf_holdings set name = null where etf = 'BRD500'")
        conn.commit()
