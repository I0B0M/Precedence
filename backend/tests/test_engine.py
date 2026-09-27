from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta

import pytest

from stone.signals import engine as e

ET = e.EASTERN


@dataclass(frozen=True)
class B:
    day: date
    open: float
    close: float


def weekdays(start: date, n: int) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def flat_bars(n: int, start: date = date(2024, 1, 1), price: float = 100.0) -> list[B]:
    return [B(d, price, price) for d in weekdays(start, n)]


def at(d: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(d, time(hh, mm), tzinfo=ET)


# ---------- statistics ----------

def test_wilson_matches_reference_value():
    low, high = e.wilson(5, 10)
    assert low == pytest.approx(0.2693, abs=1e-4)
    assert high == pytest.approx(0.7307, abs=1e-4)


def test_wilson_with_no_cases_is_the_whole_range():
    assert e.wilson(0, 0) == (0.0, 1.0)


def test_fewer_than_ten_cases_is_weak_however_good_it_looks():
    assert e.label_for(9, 0.99, 0.10) == e.WEAK


def test_strong_needs_the_low_end_strictly_above_normal():
    assert e.label_for(10, 0.51, 0.50) == e.STRONG
    assert e.label_for(10, 0.50, 0.50) == e.NOT_PROVEN
    assert e.label_for(10, 0.40, 0.50) == e.NOT_PROVEN


# ---------- timing ----------

def test_after_close_filing_enters_at_next_open():
    bars = flat_bars(5, date(2024, 11, 1))  # Fri Nov 1, Mon Nov 4, ...
    assert bars[e.entry_index(bars, at(date(2024, 11, 1), 18, 4))].day == date(2024, 11, 4)


def test_pre_market_filing_enters_same_day():
    bars = flat_bars(5, date(2024, 11, 4))
    assert bars[e.entry_index(bars, at(date(2024, 11, 4), 8, 15))].day == date(2024, 11, 4)


def test_filing_at_the_open_waits_for_the_next_open():
    bars = flat_bars(5, date(2024, 11, 4))
    assert bars[e.entry_index(bars, at(date(2024, 11, 4), 9, 30))].day == date(2024, 11, 5)


def test_event_after_last_bar_has_no_entry():
    bars = flat_bars(3, date(2024, 11, 4))
    assert e.entry_index(bars, at(date(2024, 11, 6), 17)) is None


def test_rate_value_is_known_next_weekday_afternoon():
    assert e.rate_known_at(date(2024, 11, 1)) == at(date(2024, 11, 4), 16, 15)


# ---------- detectors ----------

def test_gap_down_threshold():
    d = weekdays(date(2024, 1, 1), 4)
    bars = [B(d[0], 100, 100), B(d[1], 95.0, 96), B(d[2], 96 * 0.951, 90), B(d[3], 80, 80)]
    events = e.detect_gap_downs(bars)
    assert [ev.known_at for ev in events] == [e.open_at(d[1]), e.open_at(d[3])]


def test_gap_down_is_measured_from_the_next_open_not_the_gap_open():
    bars = flat_bars(30)
    gap_day = bars[5].day
    bars[5] = B(gap_day, 90, 90)
    [ev] = e.detect_gap_downs(bars)
    assert bars[e.entry_index(bars, ev.known_at)].day == bars[6].day


def test_rate_jump_threshold_and_float_noise():
    d0 = date(2024, 3, 4)
    up = e.detect_rate_jumps([(d0, 4.00), (d0 + timedelta(days=7), 4.15)])
    assert len(up) == 1 and "up 0.15" in up[0].note
    # 4.10 - 3.95 is 0.1499999... in floating point; it is still a 0.15 jump
    assert len(e.detect_rate_jumps([(d0, 3.95), (d0 + timedelta(days=7), 4.10)])) == 1
    assert e.detect_rate_jumps([(d0, 4.00), (d0 + timedelta(days=7), 4.14)]) == []


def test_rate_jump_compares_to_a_week_earlier_not_yesterday():
    d0 = date(2024, 3, 4)
    obs = [(d0, 4.00), (d0 + timedelta(days=6), 4.10), (d0 + timedelta(days=7), 4.16)]
    [ev] = e.detect_rate_jumps(obs)  # 4.16 vs 4.00 a week before, not vs 4.10
    assert "up 0.16" in ev.note


def test_insider_cluster_needs_three_distinct_filings_inside_ten_days():
    d = date(2024, 5, 1)
    three = [("a", at(d, 17)), ("b", at(d + timedelta(days=4), 17)), ("c", at(d + timedelta(days=9), 17))]
    [ev] = e.detect_insider_clusters(three)
    assert ev.known_at == three[2][1]

    spread = [("a", at(d, 17)), ("b", at(d + timedelta(days=5), 17)), ("c", at(d + timedelta(days=11), 17))]
    assert e.detect_insider_clusters(spread) == []

    same_filing_twice = [("a", at(d, 17)), ("a", at(d, 17)), ("b", at(d + timedelta(days=1), 17))]
    assert e.detect_insider_clusters(same_filing_twice) == []


# ---------- evaluation ----------

def test_return_is_entry_open_to_close_after_horizon():
    bars = flat_bars(40)
    bars[10] = B(bars[10].day, 100, 104)  # open differs from close, so "from the open" is checked
    bars[14] = B(bars[14].day, 100, 90)  # horizon 5: close of the 5th day from entry
    ev = e.Event(at(bars[9].day, 17), "x")
    spec = e.Spec("t", "", "", 5)
    [case] = e.evaluate(spec, bars, [ev]).cases
    assert case.entry_day == bars[10].day and case.exit_day == bars[14].day
    assert case.ret == pytest.approx(-0.10) and case.hit


def test_overlapping_events_count_once():
    bars = flat_bars(60)
    spec = e.Spec("t", "", "", 5)
    evs = [e.Event(at(bars[i].day, 17), "x") for i in (10, 12, 20)]  # 12 is inside 10's window
    r = e.evaluate(spec, bars, evs)
    assert r.n == 2


def test_normal_days_exclude_event_windows():
    bars = [B(d, 100, 101) for d in weekdays(date(2024, 1, 1), 30)]  # every normal day rises
    for k in range(11, 16):
        bars[k] = B(bars[k].day, 100, 90)  # the event window falls
    spec = e.Spec("t", "", "", 5)
    r = e.evaluate(spec, bars, [e.Event(at(bars[10].day, 17), "x")])
    assert r.n == 1 and r.hits == 1
    # 26 possible start days; 7..15 would reach into the window [11, 16), so 17 are normal
    assert r.normal_n == 17
    assert r.normal_rate == 0.0  # only clean days count, and every clean day rose


def test_live_window_is_firing_not_a_case():
    bars = flat_bars(30)
    spec = e.Spec("t", "", "", 5)
    r = e.evaluate(spec, bars, [e.Event(at(bars[27].day, 17), "late")])
    assert r.n == 0 and r.firing is not None and r.firing.note == "late"


def test_event_after_last_bar_is_firing():
    bars = flat_bars(30)
    spec = e.Spec("t", "", "", 5)
    r = e.evaluate(spec, bars, [e.Event(at(bars[-1].day, 17), "tonight")])
    assert r.firing is not None


def test_skipped_overlapping_event_can_still_be_firing():
    bars = flat_bars(30)
    spec = e.Spec("t", "", "", 5)
    evs = [e.Event(at(bars[23].day, 17), "first"), e.Event(at(bars[25].day, 17), "second")]
    r = e.evaluate(spec, bars, evs)
    assert r.firing is not None and r.firing.note == "second"


def strong_setup(fire_now: bool, events: int = 12):
    """`events` past events, each followed by a fall; normal days rise. Optionally one live event."""
    days = weekdays(date(2023, 1, 2), 40 + events * 30)
    bars = [B(d, 100, 100.5) for d in days]
    starts = list(range(20, 20 + events * 30, 30))
    for s in starts:
        for k in range(s + 1, s + 1 + 5):
            bars[k] = B(bars[k].day, 100, 97)
    evs = [e.Event(at(days[s], 17), f"case {s}") for s in starts]
    if fire_now:
        evs.append(e.Event(at(days[-2], 17), "now"))
    return bars, evs


def test_twelve_falls_against_rising_normal_days_is_strong():
    bars, evs = strong_setup(fire_now=False)
    r = e.evaluate(e.Spec("t", "", "", 5), bars, evs)
    assert r.n == 12 and r.hits == 12
    assert r.label == e.STRONG and r.low > r.normal_rate


def test_watch_only_when_a_strong_signal_is_firing():
    spec = e.Spec("t", "", "", 5)
    strong_live = e.evaluate(spec, *strong_setup(fire_now=True))
    strong_quiet = e.evaluate(spec, *strong_setup(fire_now=False))
    assert strong_live.label == e.STRONG and strong_live.firing
    assert e.holding_state([strong_live]) == e.WATCH
    assert e.holding_state([strong_quiet]) == e.CALM

    bars = flat_bars(30)
    weak_live = e.evaluate(spec, bars, [e.Event(at(bars[-1].day, 17), "now")])
    assert weak_live.label == e.WEAK and weak_live.firing
    assert e.holding_state([weak_live]) == e.CALM


def test_strong_result_gets_a_holdout_that_held_up():
    spec = e.Spec("t", "", "", 5)
    r = e.test_signal(spec, *strong_setup(fire_now=False, events=24))
    assert r.label == e.STRONG and r.holdout is not None
    assert r.holdout.first.n + r.holdout.second.n == r.n
    assert r.holdout.first.n >= 10 and r.holdout.second.n >= 10
    assert r.holdout.held_up and r.holdout.verdict == e.HELD_UP


def test_holdout_with_fewer_than_ten_cases_in_a_half_is_too_few_to_check():
    r = e.test_signal(e.Spec("t", "", "", 5), *strong_setup(fire_now=False))  # 12 cases: 6 per half
    assert r.label == e.STRONG and r.holdout.first.n < 10
    assert r.holdout.first.hit_rate > r.holdout.first.normal_rate  # it looks fine, but 6 cases prove nothing
    assert not r.holdout.held_up and r.holdout.verdict == e.TOO_FEW_TO_CHECK


def test_a_case_whose_window_crosses_the_split_is_in_neither_half_and_is_named():
    bars, evs = strong_setup(fire_now=False)  # 400 bars, cases every 30 from bar 20; the split is bar 200
    for k in range(196, 201):  # one more fall, from bar 196 through bar 200: it starts before the split, ends on it
        bars[k] = B(bars[k].day, 100, 97)
    evs.append(e.Event(at(bars[195].day, 17), "crosses"))
    r = e.test_signal(e.Spec("t", "", "", 5), bars, evs)
    assert r.label == e.STRONG and r.n == 13 and r.hits == 13
    h = r.holdout
    assert h.split_day == bars[200].day
    assert h.first.n + h.second.n == 12
    assert [c.note for c in h.excluded] == ["crosses"] and h.excluded[0].hit
    from stone.api.views import excluded_json
    ex = excluded_json(h, 5)
    assert (ex["n"], ex["hits"]) == (1, 1) and ex["cases"][0]["entry_day"] == bars[196].day.isoformat()
    assert ex["reason"] == (f"Its 5-trading-day window starts before the split ({bars[200].day.isoformat()}) "
                            "and ends after it, so neither half has the whole window to measure.")


def test_no_case_crossing_the_split_means_nothing_excluded():
    r = e.test_signal(e.Spec("t", "", "", 5), *strong_setup(fire_now=False, events=24))
    assert r.holdout.excluded == ()
    from stone.api.views import excluded_json
    assert excluded_json(r.holdout, 5) == {"n": 0, "hits": 0, "reason": None, "cases": []}


def test_holdout_fails_when_one_half_does_not_hold():
    bars, evs = strong_setup(fire_now=False, events=24)
    half = len(bars) // 2
    for i in range(half, len(bars)):  # second half: events are followed by rises, normal days fall
        falling = bars[i].close < bars[i].open
        bars[i] = B(bars[i].day, 100, 103 if falling else 99.5)
    h = e.holdout(e.Spec("t", "", "", 5), bars, evs)
    assert h.first.n >= 10 and h.second.n >= 10
    assert h.first.hit_rate > h.first.normal_rate
    assert h.second.hit_rate < h.second.normal_rate
    assert not h.held_up and h.verdict == e.DID_NOT_HOLD


def test_only_strong_results_get_a_holdout():
    bars = flat_bars(30)
    r = e.test_signal(e.Spec("t", "", "", 5), bars, [e.Event(at(bars[5].day, 17), "x")])
    assert r.label == e.WEAK and r.holdout is None


# ---------- market-relative (rate jump) ----------

REL = e.Spec("t", "", "", 5, vs_market=True)


def one_case(spec, stock_close: float, market_close: float, market=True):
    """Flat bars; on the exit day the stock and the market close at the given prices."""
    bars, mkt = flat_bars(40), flat_bars(40)
    bars[14] = B(bars[14].day, 100, stock_close)
    mkt[14] = B(mkt[14].day, 100, market_close)
    [case] = e.evaluate(spec, bars, [e.Event(at(bars[9].day, 17), "x")], mkt if market else None).cases
    return case


def test_rate_jump_falling_less_than_the_market_is_not_a_hit():
    case = one_case(e.RATES, 98, 95)  # stock -2%, market -5%
    assert case.ret == pytest.approx(-0.02) and case.market_ret == pytest.approx(-0.05)
    assert not case.hit


def test_rising_less_than_the_market_is_a_hit():
    case = one_case(REL, 101, 104)  # stock +1%, market +4%
    assert case.ret > 0 and case.hit


def test_other_signals_ignore_the_market():
    for spec in (e.INSIDER, e.GAP):
        assert not spec.vs_market
    case = one_case(e.Spec("t", "", "", 5), 98, 95)  # lower, even though it beat the market
    assert case.hit and case.market_ret is None


def test_normal_days_are_also_judged_against_the_market():
    days = weekdays(date(2024, 1, 1), 30)
    bars = [B(d, 100, 101) for d in days]  # the stock rises every day...
    mkt = [B(d, 100, 103) for d in days]  # ...but the market rises more
    r = e.evaluate(REL, bars, [e.Event(at(days[10], 17), "x")], mkt)
    assert r.normal_n == 17 and r.normal_rate == 1.0


def test_market_is_matched_by_date_not_position():
    days = weekdays(date(2024, 1, 1), 41)
    mkt = [B(d, 100, 90 if d == days[15] else 100) for d in days]
    bars = [B(d, 100, 100) for d in days if d != days[3]]  # the stock has no bar on day 3
    [case] = e.evaluate(REL, bars, [e.Event(at(days[10], 17), "x")], mkt).cases
    assert case.entry_day == days[11] and case.exit_day == days[15]
    assert case.market_ret == pytest.approx(-0.10)


def test_market_relative_signal_refuses_to_run_without_the_market():
    bars = flat_bars(30)
    with pytest.raises(ValueError):
        e.evaluate(REL, bars, [e.Event(at(bars[5].day, 17), "x")], None)


def test_holdout_of_a_market_relative_signal_uses_the_market():
    bars, evs = strong_setup(fire_now=False)
    h = e.holdout(REL, bars, evs, bars)  # measured against itself, nothing can do worse
    assert h.first.n > 0 and h.first.hits == 0 and h.second.hits == 0


# ---------- many tests at once (Benjamini-Hochberg) ----------

def test_binomial_tail_matches_reference_values():
    assert e.binom_sf(12, 15, 0.5) == pytest.approx(0.017578125)  # P(X >= 12), X ~ Bin(15, 0.5)
    assert e.binom_sf(0, 15, 0.3) == pytest.approx(1.0)
    assert e.binom_sf(16, 15, 0.3) == 0.0


def test_p_value_asks_how_likely_this_many_hits_are_at_the_normal_rate():
    r = e.Result(signal="t", horizon=5, n=15, hits=12, hit_rate=0.8, normal_n=400, normal_hits=200, normal_rate=0.5,
                 low=0.6, high=0.9, label=e.STRONG, firing=None)
    assert e.p_value(r) == pytest.approx(0.017578125)
    assert e.p_value(replace(r, n=9)) is None  # fewer than 10 cases isn't tested at all
    assert e.p_value(replace(r, normal_rate=None)) is None


def test_benjamini_hochberg_keeps_the_ones_that_survive_the_false_discovery_rate():
    # sorted: .01 .03 .04 .20 against .025 .05 .075 .10 -> the largest passing rank is 3
    assert e.benjamini_hochberg([0.01, 0.04, 0.03, 0.20], q=0.10) == [True, True, True, False]
    assert e.benjamini_hochberg([0.2, 0.3], q=0.10) == [False, False]
    # a later rank passing rescues an earlier one that missed its own threshold
    assert e.benjamini_hochberg([0.06, 0.07], q=0.10) == [True, True]
    assert e.benjamini_hochberg([], q=0.10) == []
    # 0.09 is under 10%, but the smallest of 4 p-values must clear 10% / 4 = 2.5%
    assert e.benjamini_hochberg([0.09, 0.5, 0.6, 0.7], q=0.10) == [False, False, False, False]


# ---------- the stricter test, as evidence next to the label ----------

def test_newcombe_matches_the_published_reference_value():
    # Newcombe (1998), Stat Med 17:873, example (a): 56/70 vs 48/80, method 10 at 95%
    low, high = e.newcombe(56, 70, 48, 80, z=1.959963984540054)
    assert low == pytest.approx(0.0524, abs=1e-4) and high == pytest.approx(0.3339, abs=1e-4)


def test_overlapping_normal_days_count_as_the_periods_they_span():
    bars = flat_bars(30)
    r = e.evaluate(e.Spec("t", "", "", 5), bars, [e.Event(at(bars[10].day, 17), "x")])
    # normal starts 0..6 (spanning days 0..10) and 16..25 (spanning 16..29): 25 days = 5 periods, not 17
    assert r.normal_n == 17 and r.normal_periods == pytest.approx(5.0)


def counts(n, hits, normal_rate, periods, label=e.STRONG):
    return e.Result(signal="t", horizon=20, n=n, hits=hits, hit_rate=hits / n, normal_n=125,
                    normal_hits=round(normal_rate * 125), normal_rate=normal_rate, low=None, high=None,
                    label=label, firing=None, normal_periods=periods)


def test_strict_evidence_for_amazon_s_insider_cluster_is_borderline():
    # AMZN in frontend/fixtures: 6 of 12 vs 32 of 125 normal days (12.9 periods), STRONG under the label rule
    st = e.strict_evidence(counts(12, 6, 32 / 125, 12.9))
    assert st.p == pytest.approx(0.104, abs=0.001)
    assert st.diff_low == pytest.approx(-0.070, abs=0.001) and st.diff_high == pytest.approx(0.502, abs=0.001)


def test_strict_evidence_with_an_exactly_known_normal_rate_is_the_score_test():
    # one-sample score test: z = (0.8 - 0.5) / sqrt(0.25 / 15) = 2.3238, P(Z > z) = 0.01007
    assert e.strict_evidence(counts(15, 12, 0.5, 1e9)).p == pytest.approx(0.01007, abs=1e-5)
    assert 0.5 < e.strict_evidence(counts(15, 4, 0.5, 80)).p < 1  # fewer hits than normal: no evidence at all


def test_strict_evidence_only_for_tested_results():
    assert e.strict_evidence(counts(9, 9, 0.2, 50)) is None  # fewer than 10 cases
    assert e.strict_evidence(replace(counts(12, 6, 0.3, 10), normal_rate=None)) is None


def test_strict_evidence_never_changes_the_label():
    days = weekdays(date(2024, 1, 1), 160)
    bars = [B(d, 100, 100.2) for d in days]
    starts = range(5, 5 + 12 * 12, 12)  # 10-day windows with 2 clean days between: few normal periods
    for j, s in enumerate(starts):
        for k in range(s + 1, s + 11):
            bars[k] = B(days[k], 100, 101 if j < 2 else 99)
    for k in range(0, 160, 3):
        if all(not (s + 1 <= k <= s + 10) for s in starts):
            bars[k] = B(days[k], 100, 96)
    r = e.evaluate(e.Spec("t", "", "", 10), bars, [e.Event(at(days[s], 17), str(s)) for s in starts])
    st = e.strict_evidence(r)
    assert r.label == e.STRONG and r.hits == 10 and r.n == 12  # the label rule, unchanged
    assert st.diff_low <= 0 and st.p >= 0.05  # the stricter test calls it borderline
