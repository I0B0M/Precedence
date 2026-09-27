import os
from datetime import date
from pathlib import Path

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.ingest import sample, store  # noqa: E402
from stone.sources import etfs  # noqa: E402
from stone.sources.nport import QQQ_SOURCE, NportRejected, parse_nport  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
NPORT = (FIXTURES / "nport_qqq.xml").read_bytes()  # Invesco QQQ Trust NPORT-P 0001067839-26-000030, filed 2026-08-28


@pytest.fixture(scope="module")
def by_cusip():
    spy = etfs.parse_spdr("SPY", (FIXTURES / "spdr_spy_holdings.xlsx").read_bytes())
    return {c: t for t, c in spy.cusips.items()}


def test_spdr_file_gives_each_holdings_cusip():
    spy = etfs.parse_spdr("SPY", (FIXTURES / "spdr_spy_holdings.xlsx").read_bytes())
    assert spy.cusips["NVDA"] == "67066G104" and spy.cusips["AAPL"] == "037833100"


def test_nport_holdings_are_dated_by_the_report_date_not_the_fiscal_year_end(by_cusip):
    h = parse_nport(NPORT, by_cusip)
    assert h.as_of == date(2026, 6, 30)  # repPdDate
    assert h.fiscal_period_end == date(2026, 9, 30)  # repPdEnd: in the future, never shown as the date


def test_nport_stock_lines_become_weights_with_exact_tickers_only(by_cusip):
    h = parse_nport(NPORT, by_cusip)
    assert len(h.weights) == 102 and sum(h.weights.values()) == pytest.approx(0.99927, abs=1e-5)
    assert h.weights["NVDA"] == pytest.approx(0.07596756593966)  # pctVal 7.596756593966 is percent of net assets
    assert "GOOGL" in h.weights and "GOOG" in h.weights  # two share classes, told apart by CUSIP, not by name
    # no CUSIP match in the SPY file: kept under the filing's own identifier, never a guessed ticker
    assert h.names["CUSIP:N07059210"] == "ASML Holding N.V." and "ASML" not in h.weights
    assert h.names["ISIN:NL0015001FS8"] == "FERROVIAL NV"  # no CUSIP in the filing, so its ISIN
    assert len(h.unmatched) == 15 and all(":" in k for k in h.unmatched)
    assert set(h.skipped) == {"Invesco Private Prime Fund", "Invesco Private Government Fund", "N/A"}  # not stocks


def test_nport_is_refused_when_the_weights_dont_add_up(by_cusip):
    broken = NPORT.replace(b"<pctVal>7.596756593966</pctVal>", b"<pctVal>0.596756593966</pctVal>")  # NVDA 7.6% -> 0.6%
    with pytest.raises(NportRejected, match="not about 100%"):
        parse_nport(broken, by_cusip)


def test_nport_without_a_report_date_is_refused(by_cusip):
    with pytest.raises(NportRejected, match="repPdDate"):
        parse_nport(NPORT.replace(b"<repPdDate>2026-06-30</repPdDate>", b""), by_cusip)


def test_fund_page_shows_the_nport_date_and_says_it_lags(by_cusip):
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.execute("insert into companies (ticker, cik, name, sector, kind, source) values "
                 "('NPQ', null, 'N-PORT test fund', null, 'etf', 'sample') on conflict do nothing")
    h = parse_nport(NPORT, by_cusip)
    store.upsert_etf_holdings(conn, "NPQ", h.as_of, h.weights, QQQ_SOURCE, h.names)
    conn.commit()
    try:
        f = TestClient(app).get("/api/funds/NPQ").json()
        assert f["holdings_as_of"] == "2026-06-30" and f["holdings_source"] == QQQ_SOURCE
        assert f["total_holdings_count"] == 102
        assert f["note"].startswith("Holdings as of 2026-06-30, from the fund's SEC N-PORT filing.")
        assert all(":" not in x["ticker"] for x in f["holdings"])  # the top 25 are all exact tickers
    finally:
        conn.execute("delete from etf_holdings where etf = 'NPQ'")
        conn.execute("delete from companies where ticker = 'NPQ'")
        conn.commit()


VOO = (FIXTURES / "nport_voo.xml").read_bytes()  # Vanguard 500 Index Fund NPORT-P 0000036405-26-000473, filed 2026-08-28
IVV = (FIXTURES / "nport_ivv.xml").read_bytes()  # iShares Core S&P 500 ETF NPORT-P 0002071691-26-019760, filed 2026-08-25


def test_voo_and_ivv_from_their_own_series_filings(by_cusip):
    from stone.sources.nport import SERIES_FUNDS, cusips_by_isin
    voo = parse_nport(VOO, by_cusip, series_id=SERIES_FUNDS["VOO"].series_id)
    assert voo.as_of == date(2026, 6, 30) and voo.fiscal_period_end == date(2026, 12, 31)  # repPdDate, not repPdEnd
    assert len(voo.weights) == 506 and sum(voo.weights.values()) == pytest.approx(0.9975, abs=1e-4)
    ivv = parse_nport(IVV, by_cusip, cusips_by_isin(VOO), series_id=SERIES_FUNDS["IVV"].series_id)
    assert ivv.as_of == date(2026, 6, 30) and len(ivv.weights) == 503
    assert "LIN" in ivv.weights and len(ivv.unmatched) == 8  # Linde plc: ISIN only in iShares' filing


def test_ivv_isin_only_lines_stay_identifiers_without_a_filing_that_pairs_them(by_cusip):
    ivv = parse_nport(IVV, by_cusip)
    assert "LIN" not in ivv.weights and ivv.names["ISIN:IE000S9YS762"] == "Linde plc"  # never a guessed ticker


def test_a_trusts_filing_for_another_series_is_refused(by_cusip):
    from stone.sources.nport import SERIES_FUNDS
    with pytest.raises(NportRejected, match="S000002839"):
        parse_nport(VOO, by_cusip, series_id=SERIES_FUNDS["IVV"].series_id)


def test_a_fund_uses_its_own_holdings_once_loaded_and_borrows_until_then(by_cusip, monkeypatch):
    from stone.api import main
    monkeypatch.setitem(main.HOLDINGS_FROM, "NPV", "BRD500")  # like VOO -> SPY
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.execute("insert into companies (ticker, cik, name, sector, kind, source) values "
                 "('NPV', null, 'N-PORT series test fund', null, 'etf', 'sample') on conflict do nothing")
    conn.commit()
    client = TestClient(app)
    try:
        before = client.get("/api/funds/NPV").json()
        assert before["holdings_source"] == "sample" and before["holdings_as_of"] == "2026-09-25"  # BRD500's
        assert "Tracks the same index as BRD500" in before["note"]
        h = parse_nport(VOO, by_cusip)
        store.upsert_etf_holdings(conn, "NPV", h.as_of, h.weights, "SEC N-PORT (Vanguard 500 Index Fund)", h.names)
        conn.commit()
        after = client.get("/api/funds/NPV").json()
        assert after["holdings_as_of"] == "2026-06-30" and after["total_holdings_count"] == 506
        assert after["note"].startswith("Holdings as of 2026-06-30, from the fund's SEC N-PORT filing.")
    finally:
        conn.execute("delete from etf_holdings where etf = 'NPV'")
        conn.execute("delete from companies where ticker = 'NPV'")
        conn.commit()
