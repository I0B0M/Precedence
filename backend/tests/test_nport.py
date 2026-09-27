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
