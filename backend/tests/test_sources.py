import json
from dataclasses import replace
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


def test_gemini_defaults_to_a_current_model():
    # Google limits the 2.5 models to past users, so a new key would fail on them (ai.google.dev/gemini-api/docs/models)
    assert not gemini.MODEL.startswith("gemini-2.")


def test_gemini_blocked_or_unreadable_answers_say_so():
    blocked = {"promptFeedback": {"blockReason": "SAFETY"}}
    with pytest.raises(gemini.ScreenshotUnreadable, match="SAFETY"):
        gemini.parse_response(blocked)
    not_json = {"candidates": [{"content": {"parts": [{"text": "I see a chart"}]}, "finishReason": "STOP"}]}
    with pytest.raises(gemini.ScreenshotUnreadable):
        gemini.parse_response(not_json)
    no_symbol = {"candidates": [{"content": {"parts": [{"text": '{"rows": [{"shares": 3}], "printed_total": 5}'}]}}]}
    assert gemini.parse_response(no_symbol).rows == []  # a row without a ticker can't be used


def test_gemini_filing_summary_response_parses_and_keeps_only_known_kinds():
    body = {"summary": "Sales grew.", "figures": [
        {"label": "Revenue", "kind": "revenue", "text_value": "$5.0 billion", "value": 5.0e9, "period_end": "2026-02-25"},
        {"label": "Odd", "kind": "made_up", "text_value": "7", "value": 7, "period_end": None}]}
    import json as _json
    doc = {"candidates": [{"content": {"parts": [{"text": _json.dumps(body)}]}}]}
    read = gemini.parse_summary_response(doc)
    assert read.summary == "Sales grew."
    assert [f["kind"] for f in read.figures] == ["revenue", "other"]  # an unknown kind isn't checked as if known
    with pytest.raises(gemini.ScreenshotUnreadable, match="SAFETY"):
        gemini.parse_summary_response({"promptFeedback": {"blockReason": "SAFETY"}})
    assert gemini.first_sentences("One. Two! Three? Four.", 3) == "One. Two! Three?"


# ---------- the Gemini request itself (no key needed: the HTTP call is faked) ----------

class FakeGeminiHTTP:
    """Stands in for httpx.post: answers each call with the next (status, body) and records the request."""
    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, url, json=None, headers=None, timeout=None):
        import httpx
        self.calls.append({"url": url, "body": json, "timeout": timeout})
        status, body = self.answers.pop(0)
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))


def answer(obj, **candidate):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}, "finishReason": "STOP", **candidate}]}


def gemini_client(tmp_path, monkeypatch, fake):
    import stone.fetch
    monkeypatch.setattr(stone.fetch.httpx, "post", fake)
    return gemini.GeminiClient(replace(load(), gemini_api_key="test-key", cache_dir=tmp_path))


READ = {"rows": [{"symbol": "$bx", "shares": 10, "price": 150.0, "value": 1500.0},
                 {"symbol": "CASH", "shares": None, "price": None, "value": 12.5}], "printed_total": 1512.5}


def test_gemini_request_uses_the_current_format(tmp_path, monkeypatch):
    fake = FakeGeminiHTTP((200, answer(READ)))
    read = gemini_client(tmp_path, monkeypatch, fake).read_screenshot(b"\x89PNG", "image/png")
    assert [r.symbol for r in read.rows] == ["BX", "CASH"] and read.printed_total == 1512.5
    [call] = fake.calls
    assert call["url"].endswith(f"/models/{gemini.MODEL}:generateContent")
    config = call["body"]["generationConfig"]
    assert config["responseFormat"]["text"]["mimeType"] == "application/json"
    assert config["responseFormat"]["text"]["schema"]["properties"]["printed_total"]["type"] == ["number", "null"]
    assert config["thinkingConfig"] == {"thinkingLevel": "low"}
    assert "temperature" not in config and "responseSchema" not in config  # both deprecated for 3.x models


def test_gemini_falls_back_to_the_older_format_on_400(tmp_path, monkeypatch):
    fake = FakeGeminiHTTP((400, {"error": {"code": 400, "status": "INVALID_ARGUMENT"}}), (200, answer(READ)))
    read = gemini_client(tmp_path, monkeypatch, fake).read_screenshot(b"\x89PNG", "image/png")
    assert len(read.rows) == 2 and len(fake.calls) == 2
    legacy = fake.calls[1]["body"]["generationConfig"]
    assert legacy["responseMimeType"] == "application/json" and "thinkingConfig" not in legacy
    shares = legacy["responseSchema"]["properties"]["rows"]["items"]["properties"]["shares"]
    assert shares == {"type": "NUMBER", "nullable": True}


def test_gemini_quota_and_key_errors_are_not_retried(tmp_path, monkeypatch):
    import httpx
    for status in (403, 429):
        fake = FakeGeminiHTTP((status, {"error": {"code": status}}))
        with pytest.raises(httpx.HTTPStatusError):
            gemini_client(tmp_path, monkeypatch, fake).read_screenshot(b"\x89PNG" + bytes([status % 256]), "image/png")
        assert len(fake.calls) == 1


def test_gemini_answers_are_cached_but_unusable_ones_are_not(tmp_path, monkeypatch):
    fake = FakeGeminiHTTP((200, answer(READ)))
    client = gemini_client(tmp_path, monkeypatch, fake)
    client.read_screenshot(b"same image", "image/png")
    client.read_screenshot(b"same image", "image/png")
    assert len(fake.calls) == 1  # the second read came from the cache

    empty = {"candidates": [{"content": {"parts": []}, "finishReason": "MAX_TOKENS"}]}
    fake = FakeGeminiHTTP((200, empty), (200, answer(READ)))
    client = gemini_client(tmp_path, monkeypatch, fake)
    with pytest.raises(gemini.ScreenshotUnreadable, match="MAX_TOKENS"):
        client.read_screenshot(b"another image", "image/png")
    assert len(client.read_screenshot(b"another image", "image/png").rows) == 2  # asked again, not served the failure
    assert len(fake.calls) == 2


def test_gemini_answer_can_come_in_several_parts_and_thoughts_are_skipped():
    doc = {"candidates": [{"content": {"parts": [
        {"text": "thinking about the table", "thought": True},
        {"text": '{"rows": [{"symbol": "BX", "value": 5}], '},
        {"text": '"printed_total": 5}', "thoughtSignature": "abc"}]}, "finishReason": "STOP"}]}
    read = gemini.parse_response(doc)
    assert read.rows == [gemini.ReadRow("BX", None, None, 5)] and read.printed_total == 5


def test_gemini_summary_is_cached_per_filing(tmp_path, monkeypatch):
    summary = {"summary": "Sales grew. Profit held.", "figures": [
        {"label": "Revenue", "kind": "revenue", "text_value": "$5.0 billion", "value": 5.0e9, "period_end": None}]}
    fake = FakeGeminiHTTP((200, answer(summary)))
    client = gemini_client(tmp_path, monkeypatch, fake)
    read, cached, _ = client.summarize_filing("text", "ORCA", "10-Q", "0000-1")
    assert read.summary == "Sales grew. Profit held." and cached is False
    assert fake.calls[0]["timeout"] == 120  # a whole filing takes longer to read than a screenshot
    assert client.summarize_filing("text", "ORCA", "10-Q", "0000-1")[1] is True and len(fake.calls) == 1


def test_symbols_are_cleaned_the_way_stone_writes_them():
    assert [gemini.clean_symbol(s) for s in ("$aapl ", "BRK-B", "brk/b", "BRK B", "SPY")] == \
        ["AAPL", "BRK.B", "BRK.B", "BRK.B", "SPY"]


def test_an_empty_gemini_model_setting_means_the_default(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "")  # what `GEMINI_MODEL=` in backend/.env loads as
    assert gemini.model_from_env() == gemini.DEFAULT_MODEL
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    assert gemini.model_from_env() == "gemini-3.5-flash-lite"
