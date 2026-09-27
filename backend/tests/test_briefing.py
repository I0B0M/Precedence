"""The briefing: every line grounded in its evidence, the gate's choices, and the saved demo's script."""

import json
import shutil

import pytest

from stone.briefing import experts as ex
from stone.briefing import saved as saved_briefings
from stone.briefing.lines import Line, Point, check, claims, grounded, with_pro
from stone.briefing.panel import briefing_json, company_briefing, gate, portfolio_briefing


def line(text: str, evidence=(), cites=("signal:rate_jump",), tone="note") -> Line:
    return Line("t", tone, text, tuple(evidence), tuple(cites))


# ---------- the check ----------

def test_numbers_must_come_from_the_evidence():
    ok = line("Amazon was lower 20 trading days later 6 of the last 12 times, against 26% of normal days.",
              (20, 6, 12, 0.256))
    assert check(ok) == []
    wrong = line("Amazon was lower 20 trading days later 7 of the last 12 times, against 26% of normal days.",
                 (20, 6, 12, 0.256))
    assert check(wrong) == ["7 is not in its evidence"]
    assert check(line("It fell 7.6%.", (-0.0759,))) == []  # a loss is printed without its sign
    assert check(line("It fell 7.7%.", (-0.0759,))) == ["7.7% is not in its evidence"]  # rounding is exact


def test_money_scales_and_decimals_are_checked():
    assert grounded("$5.0 billion", (5_043_978_000.0,))
    assert not grounded("$5.1 billion", (5_043_978_000.0,))
    assert grounded("$1,263", (-1262.71,)) and not grounded("$1,262", (-1262.71,))
    assert grounded("$352.81", (352.8106,)) and grounded("42,246", (42246.0,))


def test_names_and_dates_are_not_claims():
    text = "Since August 2024, the 10-year yield on April 3, 2025 moved; an 8-K, a 10-Q/A and Form 4 are forms of the S&P 500."
    assert claims(text) == []
    assert claims("Broad 500 Index Fund fell 3%.") == ["500", "3%"]
    assert claims("Broad 500 Index Fund fell 3%.", ("Broad 500 Index Fund",)) == ["3%"]


def test_one_sentence_of_28_words_at_most_with_no_markdown_and_good_cites():
    assert check(line("Timothy S. Teter sold shares.")) == []  # a middle initial isn't a full stop
    assert check(line("One. Two.")) == ["not exactly one sentence"]
    assert check(line("No stop")) == ["not exactly one sentence"]
    assert check(line(" ".join(["word"] * 29) + ".")) == ["29 words, over 28"]
    assert check(line("A **bold** claim.")) == ["markdown in the text"]
    assert check(line("Fine.", cites=())) == ["cites nothing"]
    assert check(line("Fine.", cites=("price:Sept 25",))) == ["bad cite price:Sept 25"]
    assert check(line("Fine.", tone="loud")) == ["unknown tone loud"]


# ---------- the gate ----------

def point(key: str, expert: str, salience: int, n_lines: int = 1, text: str = "Fine.") -> Point:
    return Point(key, expert, salience, tuple(Line(f"{key}{i}", "note", text, (), ("risk:beta",)) for i in range(n_lines)))


def test_gate_speaks_highest_first_within_the_budget_and_the_cap():
    points = [point("low", "a", 10), point("mid", "b", 50, 2), point("top", "a", 90),
              point("top2", "a", 80), point("top3", "a", 70)]
    kept, held = gate(points, budget=4, per_expert=2)
    assert [p.key for p in kept] == ["top", "top2", "mid"]
    assert {h.point.key: h.reason for h in held} == {
        "top3": "the a expert already has 2 points", "low": "the a expert already has 2 points"}
    kept, held = gate(points, budget=3, per_expert=5)
    assert [p.key for p in kept] == ["top", "top2", "top3"]
    assert [h.reason for h in held] == ["over the 3-line limit", "over the 3-line limit"]


def test_gate_holds_back_a_point_that_fails_the_check():
    kept, held = gate([point("bad", "a", 90, text="Up 7%."), point("ok", "b", 10)], budget=5)
    assert [p.key for p in kept] == ["ok"]
    assert held[0].reason == "failed the check: bad0: 7% is not in its evidence"


# ---------- experts on small cases ----------

def signal(key="insider_cluster", label="STRONG", n=12, hits=6, normal=0.256, horizon=20, firing=True,
           vs_market=False, strict=None, verdict=None, fdr10=None) -> dict:
    return {"signal": key, "lite": "Executives sold shares", "label": label, "n": n, "hits": hits, "horizon": horizon,
            "normal_rate": normal, "vs_market": vs_market, "strict": strict, "fdr10_survives": fdr10,
            "holdout": {"verdict": verdict} if verdict else None,
            "firing": {"known_at": "2026-09-03T16:42:02-04:00",
                       "note": "2026-09-24: 10-year yield 5.18%, up 0.24 pt in a week"} if firing else None}


def company(ticker="AMZN", name="Amazon", kind="stock", signals=(), state="CALM") -> dict:
    return {"company": {"ticker": ticker, "name": name, "kind": kind}, "state": state,
            "last": {"close": 249.63, "day": "2026-09-25", "change": 0.0012}, "signals": list(signals),
            "facts": [], "filings": [], "insider_sales": []}


def texts(b) -> list[str]:
    return [line.text for line in b.lines]


def test_a_saved_hold_out_without_a_verdict_is_never_said_to_hold_up():
    s = signal(verdict=None)
    s["holdout"] = {"held_up": True}  # exported before the verdict existed
    b = company_briefing(company(signals=[s], state="WATCH"))
    assert not any("held up" in t or "too few" in t for t in texts(b))
    b = company_briefing(company(signals=[signal(verdict="too few cases to check")], state="WATCH"))
    assert "There are too few cases yet to check it on each half of the history." in texts(b)


def test_how_sure_uses_the_correction_the_landing_and_pro_use():
    # AMZN: STRONG, but it doesn't survive the correction (the landing says 0 of 309 do); the label never changes
    no = company_briefing(company(signals=[signal(strict={"diff_low": -0.07}, fdr10=False,
                                                  verdict="too few cases to check")], state="WATCH"))
    assert ("It doesn't survive the correction for testing many stocks at once, and there are too few cases yet "
            "to check it on each half of the history.") in texts(no)
    assert texts(no)[1] == "Amazon needs a look today."
    mixed = company_briefing(company(signals=[signal(fdr10=False, verdict="held up")], state="WATCH"))
    assert ("It doesn't survive the correction for testing many stocks at once, but it held up in both halves "
            "of the history.") in texts(mixed)
    yes = company_briefing(company(signals=[signal(fdr10=True, verdict="held up")], state="WATCH"))
    assert ("It survives the correction for testing many stocks at once, and it held up in both halves of the "
            "history.") in texts(yes)
    # the stricter test alone never becomes "passes" or "borderline" in the spoken line
    strict_only = company_briefing(company(signals=[signal(strict={"diff_low": 0.05})], state="WATCH"))
    assert not any("stricter" in t or "passes" in t or "survive" in t for t in texts(strict_only))


def test_the_market_s_own_test_is_said_to_be_outside_the_correction():
    from stone.briefing.experts import confidence_line
    line = confidence_line(signal(key="market_rate_jump", verdict="too few cases to check"), "SPY")
    assert line.text == ("It's the market's own test, outside the correction across stocks, and "
                         "there are too few cases yet to check it on each half of the history.")


def test_market_relative_signals_say_worse_than_the_market():
    s = signal("rate_jump", "NOT PROVEN", 15, 8, 0.51, 5, vs_market=True)
    b = company_briefing(company("BX", "Blackstone", signals=[s]))
    assert ("Blackstone did worse than the market over the next 5 trading days 8 of the last 15 times, "
            "against 51% of normal days, so it hasn't clearly mattered.") in texts(b)
    assert "Rates jumped: the 10-year Treasury yield reached 5.18%, up 0.24 points in a week." in texts(b)


def test_a_rare_signal_is_too_few_to_test():
    b = company_briefing(company(signals=[signal("gap_down", "WEAK", 2, 0, 0.46)]))
    assert "It has happened only 2 times for Amazon, too few to test." in texts(b)


def test_no_data_and_quiet_signals():
    no_data = {**signal(label="NO DATA", n=0), "firing": None}
    quiet = signal(firing=False)
    b = company_briefing(company(signals=[no_data, quiet]))
    assert not any("executives filed" in t for t in texts(b))
    assert "When executives sold shares, it has mattered for Amazon before, but that isn't happening now." in texts(b)
    assert texts(b)[-1] == "Precedence ran 1 test on Amazon, and nothing happening now has mattered before."


def test_a_calm_portfolio_says_so_and_nothing_else_is_invented():
    co = company(signals=[signal(firing=False, label="NOT PROVEN")])
    board = {"price_as_of": "2026-09-25", "total": 2496.3,
             "rows": [{"symbol": "AMZN", "value": 2496.3, "change": 0.0012}],
             "exposure": [{"symbol": "AMZN", "state": "CALM", "total": 2496.3, "share_of_total": 1.0}], "funds": []}
    b = portfolio_briefing(board, {"AMZN": co}, None, None)
    assert texts(b) == [
        "Here is your Precedence briefing for Friday, September 25: your 1 holding is worth $2,496, up 0.1% on the day.",
        "It is calm: nothing happening now has mattered for it before.",
        "That's everything: Precedence ran 1 test on your holdings, and nothing happening now has mattered before.",
    ]
    assert all(not check(line) for line in b.lines)


def test_filings_from_the_last_week_only_and_never_form_4():
    co = company()
    co["filings"] = [{"accession": "0001-26-1", "form": "8-K", "filed_date": "2026-09-22"},
                     {"accession": "0001-26-2", "form": "4", "filed_date": "2026-09-24"},
                     {"accession": "0001-26-3", "form": "10-Q", "filed_date": "2026-09-18"}]
    points = ex.filings_expert(co, "2026-09-25")
    assert [p.lines[0].text for p in points] == [
        "Amazon filed an 8-K, a company news update, with the SEC on September 22."]


# ---------- the saved demo ----------

@pytest.fixture(scope="module")
def saved() -> dict:
    found = saved_briefings.briefings()
    return {("portfolio" if "/portfolio/" in path else path.split("/")[-1]): b for path, b in found.items()}


def test_every_saved_line_passes_the_check_and_nothing_failed(saved):
    for name, b in saved.items():
        assert b.lines, name
        assert all(check(line) == [] for line in b.lines), name
        assert not [h for h in b.held_back if h.reason.startswith("failed")], name


def test_saved_portfolio_script_leads_with_what_needs_a_look(saved):
    t = texts(saved["portfolio"])
    assert t[1] == "Amazon and the S&P 500 fund need a look; the other 4 are calm."
    assert t[2].startswith("Amazon executives filed 3 or more share sales within 10 days")
    assert t[3] == "Amazon was lower 20 trading days later 6 of the last 12 times, against 26% of normal days."
    # fdr10_survives copied into the saved data from the same trading day's API: the landing's "0 survive"
    assert t[4] == ("It doesn't survive the correction for testing many stocks at once, and there are too few cases "
                    "yet to check it on each half of the history.")
    assert "The S&P 500 fund was lower 5 trading days later 10 of the last 15 times, against 38% of normal days." in t
    assert not any("held up" in x for x in t)  # no saved result has 10+ cases in each half
    assert t[-1] == "That's everything: Precedence ran 16 tests on your holdings, and only 2 of the signals happening now have mattered before."
    assert len(t) <= 16
    pro = {line.id: line.pro for line in saved["portfolio"].lines}
    assert pro["AMZN:insider_cluster:record"] == (
        "6/12 lower after 20 days (50%, 90% Wilson range 29% to 71%) vs 32/125 normal days (26%); label STRONG.")
    assert pro["AMZN:insider_cluster:confidence"] == (
        "Newcombe range for the difference over 12.9 separate normal periods: -7 to +50 points, one-sided p 0.10; "
        "hold-out halves 2/6 and 3/5, each needing 10 cases.")
    assert pro["AMZN:insider_cluster:event"].startswith("Form 4: 7 filings with an open-market sale (code S) in 10 days")


def test_pro_captions_are_checked_like_the_spoken_text():
    base = line("Amazon was lower 6 of the last 12 times.", (6, 12))
    assert check(with_pro(base, "6/12 lower (50%) vs 26% normal.", 0.5, 0.256)) == []
    assert check(with_pro(base, "6/12 lower (51%) vs 26% normal.", 0.5, 0.256)) == ["pro: 51% is not in its evidence"]
    assert check(with_pro(base, " ".join(["w"] * 41) + ".")) == ["pro: 41 words, over 40"]
    assert check(with_pro(base, "One. Two.")) == ["pro: not exactly one sentence"]
    assert claims("FRED DGS10 5.18%.") == ["5.18%"]  # a series name isn't a claim
    assert claims("$120 through BRD500.") == ["$120"]  # nor is a ticker with digits


def test_saved_json_matches_the_tab_contract(saved):
    body = briefing_json(saved["BX"])
    assert body["ticker"] == "BX" and body["as_of"] == "2026-09-25" and body["kind"] == "company"
    assert "no language model" in body["generated_by"]
    for ln in body["lines"]:
        assert set(ln) == {"id", "text", "say", "tone", "cites", "ticker", "title", "link", "pro"}
        assert ln["tone"] in ("calm", "watch", "note") and ln["cites"]
    p = briefing_json(saved["portfolio"])
    assert p["key"] == "AAPL-10_AMZN-10_BX-10_JPM-10_NVDA-10_SPY-5"
    assert {e["name"] for e in p["panel"]["experts"]} >= {"signals", "market", "risk", "look-through"}
    assert "S and P 500" in next(ln["say"] for ln in p["lines"] if "S&P 500" in ln["text"])


def test_build_writes_what_the_api_would_send_and_refuses_a_failing_line(tmp_path, monkeypatch):
    out = tmp_path / "saved"
    shutil.copytree(saved_briefings.SAVED, out, ignore=shutil.ignore_patterns("briefing"))
    written = saved_briefings.build(out)
    assert {f.relative_to(out).as_posix() for f in written} >= {
        "briefing/BX.json", "briefing/SPY.json", "briefing/portfolio/AAPL-10_AMZN-10_BX-10_JPM-10_NVDA-10_SPY-5.json"}
    assert json.loads((out / "briefing" / "BX.json").read_text()) == briefing_json(saved_briefings.briefings(out)["briefing/BX"])
    shutil.rmtree(out / "briefing")
    monkeypatch.setattr("stone.briefing.experts.pct", lambda x, places=0: "99%")  # a template printing a wrong number
    with pytest.raises(saved_briefings.FailedCheck):
        saved_briefings.build(out)
    assert not (out / "briefing").exists()  # nothing half-written


def test_an_untested_fund_or_a_company_without_prices_says_so():
    fund = {**company("QQQ", "Invesco QQQ Trust", "etf"), "state": None, "last": None}
    b = company_briefing(fund)
    assert texts(b) == ["Precedence hasn't tested any signals for Invesco QQQ Trust yet, so it can't say whether news matters here."]
    assert not b.held_back and b.as_of == ""


def test_dollars_round_half_up_like_the_pages():
    from stone.briefing.lines import money
    assert money(4746.5) == "$4,747"  # BX 1,184.30 + AMZN 1,248.15 + SPY 2,314.05: the pages show $4,747
    assert money(1184.30 + 1248.15 + 2314.05) == "$4,747"
    assert money(1184.49) == "$1,184" and money(2.5) == "$2.50" and money(0.125) == "$0.13"


def test_the_check_rounds_the_same_way_the_line_prints():
    from stone.briefing.lines import grounded, pct
    # a greeting that says $4,747 for 4746.50 must pass its own check, or the whole line is held back
    assert grounded("$4,747", (4746.5,)) and not grounded("$4,746", (4746.5,))
    assert pct(0.28125, 2) == "28.13%" and grounded("28.13%", (0.28125,))
