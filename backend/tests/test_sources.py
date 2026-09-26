import json
from datetime import date, datetime
from pathlib import Path

import pytest

from stone.config import NotConnected, load
from stone.fetch import CachedFetcher, RateLimiter
from stone.sources import etfs, fred, gemini, prices, sec

FIX = Path(__file__).parent / "fixtures"


def fixture(name: str):
    raw = (FIX / name).read_bytes()
    return json.loads(raw) if name.endswith(".json") else raw


def test_acceptance_time_z_is_utc():
    # Real case: BX 10-Q 0001193125-26-340208. The SEC index page says Accepted 2026-08-07 16:01:44 ET.
    t = sec.parse_acceptance("2026-08-07T20:01:44.000Z")
    assert t.astimezone(sec.EASTERN).replace(tzinfo=None) == datetime(2026, 8, 7, 16, 1, 44)


def test_parse_submissions():
    filings, older = sec.parse_submissions(fixture("submissions_sample.json"))
    assert [f.form for f in filings] == ["4", "10-K", "8-K"]
    assert filings[1].accepted_at.astimezone(sec.EASTERN).hour == 14  # 18:04Z is 2:04pm EDT
    assert filings[1].report_date == date(2024, 9, 28)
    assert filings[2].report_date is None
    assert older == ["CIK0009999999-submissions-001.json"]


def test_form4_raw_xml_path_drops_style_folder():
    assert sec.form4_xml_name("xslF345X05/wk-form4_1.xml") == "wk-form4_1.xml"
    assert sec.form4_xml_name("form4.xml") == "form4.xml"


def test_parse_companyfacts():
    facts = sec.parse_companyfacts(fixture("companyfacts_sample.json"))
    assert len(facts) == 4
    annual = next(f for f in facts if f.concept == "Revenues" and f.frame == "CY2024")
    assert annual.value == 391_035_000_000 and annual.period_start == date(2023, 10, 1)
    assets = next(f for f in facts if f.concept == "Assets")
    assert assets.period_start is None
    assert {f.taxonomy for f in facts} == {"us-gaap", "dei"}


def test_parse_form4_keeps_every_line_and_reads_the_sale():
    trades = sec.parse_form4(fixture("form4_sample.xml"), {9999999})  # the fixture's issuer CIK
    assert [t.code for t in trades] == ["M", "S"]
    sale = trades[1]
    assert sale.owner_name == "DOE JANE" and sale.owner_title == "Chief Financial Officer"
    assert sale.shares == 4000 and sale.price == 222.91 and sale.acquired_disposed == "D"
    assert trades[0].price is None  # footnote only, no value


def test_form4_where_the_company_is_the_seller_not_the_issuer_is_dropped():
    # Real case: Blackstone funds file Form 4s as the REPORTING OWNER when they sell a portfolio
    # company's shares. Those sit in Blackstone's own submissions but are not trades in BX stock.
    xml = fixture("form4_sample.xml").replace(b"<rptOwnerCik>0001111111", b"<rptOwnerCik>0001393818")
    assert sec.form4_issuer_cik(xml) == 9999999
    assert sec.parse_form4(xml, {1393818}) == []  # BX is the seller here, not the issuer
    assert len(sec.parse_form4(xml, {1393818, 9999999})) == 2  # any of a company's CIKs counts (XOM has two)


def test_parse_alpaca_bars_uses_eastern_day_and_page_token():
    bars, token = prices.parse_bars(fixture("alpaca_bars_page1.json"))
    assert token == "U01QTHwyMDI0"
    assert [b.day for b in bars["SMPL"]] == [date(2024, 1, 3), date(2024, 1, 2)]


def test_alpaca_client_follows_pages_and_sorts(tmp_path, monkeypatch):
    monkeypatch.setenv("STONE_CACHE_DIR", str(tmp_path))
    client = prices.AlpacaPrices(load(), offline=True)
    start, end = date(2024, 1, 1), date(2024, 1, 5)
    for page in (1, 2):
        path = client.http.path_for(f"bars_SMPL-OTHR_{start}_{end}_p{page - 1}.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes((FIX / f"alpaca_bars_page{page}.json").read_bytes())
    out = client.daily(["SMPL", "OTHR"], start, end)
    assert [b.day for b in out["SMPL"]] == [date(2024, 1, 2), date(2024, 1, 3), date(2024, 1, 4)]
    assert len(out["OTHR"]) == 1


def test_only_wanted_filing_types_are_kept():
    assert all(sec.wanted(f) for f in ["10-K", "10-Q", "8-K", "4", "S-1", "10-K/A", "4/A", "S-1/A"])
    assert not any(sec.wanted(f) for f in ["424B2", "FWP", "DEF 14A", "SC 13G", "3", "144"])


def test_parse_fred_drops_missing_days():
    obs = fred.parse_observations(fixture("fred_sample.json"))
    assert obs == [(date(2024, 1, 2), 3.95), (date(2024, 1, 3), 3.91)]


def test_parse_gemini_response():
    read = gemini.parse_response(fixture("gemini_sample.json"))
    assert read.printed_total == 787.5
    assert read.rows[0] == gemini.ReadRow("SMPL", 55, 12.5, 687.5)
    assert read.rows[1].shares is None


def test_clients_refuse_to_run_without_keys(monkeypatch):
    for var in ("SEC_USER_AGENT", "ALPACA_API_KEY", "FRED_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.setenv(var, "")
    s = load()
    for client in (sec.SecClient, prices.AlpacaPrices, fred.FredClient, gemini.GeminiClient):
        with pytest.raises(NotConnected):
            client(s)


def test_fetcher_serves_from_cache_and_never_calls_out_offline(tmp_path):
    f = CachedFetcher("x", tmp_path, RateLimiter(100), offline=True)
    f.path_for("k").parent.mkdir(parents=True)
    f.path_for("k").write_bytes(b"cached")
    assert f.get("https://example.invalid", "k") == b"cached"
    with pytest.raises(FileNotFoundError):
        f.get("https://example.invalid", "missing")


def test_spdr_holdings_file_gives_date_and_weights():
    h = etfs.parse_spdr("SPY", fixture("spdr_spy_holdings.xlsx"))
    assert h.etf == "SPY" and h.source == "ssga" and h.as_of == date(2026, 9, 24)
    assert h.weights["NVDA"] == pytest.approx(0.08185276)  # the file says 8.185276 (percent)
    assert h.weights["AAPL"] == pytest.approx(0.07383483)
    assert "BRK.B" in h.weights and "BNY" in h.weights  # same spelling as our tickers
    assert 480 < len(h.weights) < 520
    assert 0.97 < sum(h.weights.values()) <= 1.01
    assert all(w > 0 for w in h.weights.values())


def test_xlsx_reader_places_cells_by_column_when_one_is_empty():
    import io
    import zipfile
    sheet = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="C1"><v>2.5</v></c></row>'
             '</sheetData></worksheet>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    assert etfs.xlsx_rows(buf.getvalue()) == [["Name", None, "2.5"]]  # B1 is empty, so 2.5 stays in column C
