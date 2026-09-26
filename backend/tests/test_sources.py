import json
from datetime import date, datetime
from pathlib import Path

import pytest

from stone.config import NotConnected, load
from stone.fetch import CachedFetcher, RateLimiter
from stone.sources import fred, gemini, prices, sec

FIX = Path(__file__).parent / "fixtures"


def fixture(name: str):
    raw = (FIX / name).read_bytes()
    return json.loads(raw) if name.endswith(".json") else raw


def test_acceptance_time_is_read_as_eastern():
    t = sec.parse_acceptance("2024-11-01T18:04:34.000Z")
    assert t == datetime(2024, 11, 1, 18, 4, 34, tzinfo=sec.EASTERN)
    assert t.utcoffset().total_seconds() == -4 * 3600  # EDT on Nov 1


def test_parse_submissions():
    filings, older = sec.parse_submissions(fixture("submissions_sample.json"))
    assert [f.form for f in filings] == ["4", "10-K", "8-K"]
    assert filings[1].accepted_at.hour == 18
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
    trades = sec.parse_form4(fixture("form4_sample.xml"))
    assert [t.code for t in trades] == ["M", "S"]
    sale = trades[1]
    assert sale.owner_name == "DOE JANE" and sale.owner_title == "Chief Financial Officer"
    assert sale.shares == 4000 and sale.price == 222.91 and sale.acquired_disposed == "D"
    assert trades[0].price is None  # footnote only, no value


def test_parse_massive_aggs_sorts_and_uses_eastern_day():
    bars = prices.parse_aggs(fixture("massive_aggs_sample.json"))
    assert [b.day for b in bars] == [date(2024, 1, 2), date(2024, 1, 3)]
    assert bars[0].close == 185.64


def test_parse_fred_drops_missing_days():
    obs = fred.parse_observations(fixture("fred_sample.json"))
    assert obs == [(date(2024, 1, 2), 3.95), (date(2024, 1, 3), 3.91)]


def test_parse_gemini_response():
    read = gemini.parse_response(fixture("gemini_sample.json"))
    assert read.printed_total == 787.5
    assert read.rows[0] == gemini.ReadRow("SMPL", 55, 12.5, 687.5)
    assert read.rows[1].shares is None


def test_clients_refuse_to_run_without_keys(monkeypatch):
    for var in ("SEC_USER_AGENT", "MASSIVE_API_KEY", "FRED_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.setenv(var, "")
    s = load()
    for client in (sec.SecClient, prices.MassiveClient, fred.FredClient, gemini.GeminiClient):
        with pytest.raises(NotConnected):
            client(s)


def test_fetcher_serves_from_cache_and_never_calls_out_offline(tmp_path):
    f = CachedFetcher("x", tmp_path, RateLimiter(100), offline=True)
    f.path_for("k").parent.mkdir(parents=True)
    f.path_for("k").write_bytes(b"cached")
    assert f.get("https://example.invalid", "k") == b"cached"
    with pytest.raises(FileNotFoundError):
        f.get("https://example.invalid", "missing")
