from dataclasses import dataclass
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


def strong_setup(fire_now: bool):
    """12 past events, each followed by a fall; normal days rise. Optionally one live event."""
    days = weekdays(date(2023, 1, 2), 400)
    bars = [B(d, 100, 100.5) for d in days]
    starts = list(range(20, 20 + 12 * 30, 30))
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
    r = e.test_signal(spec, *strong_setup(fire_now=False))
    assert r.label == e.STRONG and r.holdout is not None
    assert r.holdout.first.n + r.holdout.second.n == r.n
    assert r.holdout.first.n > 0 and r.holdout.second.n > 0
    assert r.holdout.held_up


def test_holdout_fails_when_one_half_does_not_hold():
    bars, evs = strong_setup(fire_now=False)
    half = len(bars) // 2
    for i in range(half, len(bars)):  # second half: events are followed by rises, normal days fall
        falling = bars[i].close < bars[i].open
        bars[i] = B(bars[i].day, 100, 103 if falling else 99.5)
    h = e.holdout(e.Spec("t", "", "", 5), bars, evs)
    assert h.first.hit_rate > h.first.normal_rate
    assert h.second.hit_rate < h.second.normal_rate
    assert not h.held_up


def test_only_strong_results_get_a_holdout():
    bars = flat_bars(30)
    r = e.test_signal(e.Spec("t", "", "", 5), bars, [e.Event(at(bars[5].day, 17), "x")])
    assert r.label == e.WEAK and r.holdout is None
