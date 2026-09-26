import pytest

from stone.portfolio import reconcile as rc
from stone.portfolio.exposure import bad_day_return, exposures


def test_exposure_adds_etf_slices_to_direct_holdings():
    ex = exposures({"HLCN": 1000.0, "BRD500": 2000.0}, {"BRD500": {"HLCN": 0.04, "MRDN": 0.01}})
    assert ex["HLCN"].direct == 1000 and ex["HLCN"].via_etf == {"BRD500": pytest.approx(80)}
    assert ex["HLCN"].total == pytest.approx(1080)
    assert ex["MRDN"].direct == 0 and ex["MRDN"].total == pytest.approx(20)
    # the 95% of the fund we can't see into stays on the board as the fund itself
    assert ex["BRD500"].total == pytest.approx(1900)


def test_a_fund_with_no_loaded_holdings_stays_whole():
    ex = exposures({"BX": 1184.3, "SPY": 2314.05}, {"SPY": {}})
    assert ex["SPY"].total == pytest.approx(2314.05) and ex["BX"].total == pytest.approx(1184.3)


def test_exposures_always_add_up_to_what_you_hold():
    values = {"HLCN": 1000.0, "BRD500": 2000.0, "SPY": 500.0}
    weights = {"BRD500": {"HLCN": 0.04, "MRDN": 0.01}, "SPY": {"HLCN": 0.6, "MRDN": 0.4000001}}
    ex = exposures(values, weights)
    assert sum(e.total for e in ex.values()) == pytest.approx(sum(values.values()))
    assert "SPY" not in ex  # fully looked through (weights that round past 100% leave nothing behind)


def test_bad_day_is_the_one_in_twenty_worst_move():
    closes = [100.0]
    for k in range(100):  # 95 flat days, 5 days of -10%
        closes.append(closes[-1] * (0.9 if k % 20 == 0 else 1.0))
    assert bad_day_return(closes) == pytest.approx(0.0)  # 5th percentile of 100 moves is the 6th worst
    closes.append(closes[-1] * 0.9)  # a 6th bad day
    assert bad_day_return(closes) == pytest.approx(-0.1)


def test_bad_day_needs_enough_history():
    assert bad_day_return([100.0] * 10) is None


def test_clean_screenshot_is_ok():
    rows = [rc.Row("HLCN", 62, 98.10, 6082.20), rc.Row("MRDN", 140, 43.20, 6048.00)]
    r = rc.reconcile(rows, 12130.20)
    assert r.status == rc.OK and all(c.ok for c in r.rows)


def test_misread_shares_caught_by_row_check_and_fixed_from_value():
    # The mockup's case: BRVE's blurry "55" read as 85. Value and total still agree.
    rows = [rc.Row("BRVE", 85, 12.50, 687.50), rc.Row("ORCA", 30, 10.00, 300.00)]
    r = rc.reconcile(rows, 987.50)
    assert r.status == rc.FIXABLE
    assert not r.rows[0].ok and r.rows[0].fix == {"shares": 55}
    assert r.rows[1].ok


def test_misread_value_caught_by_total_and_fixed_from_shares_times_price():
    rows = [rc.Row("BRVE", 55, 12.50, 887.50), rc.Row("ORCA", 30, 10.00, 300.00)]
    r = rc.reconcile(rows, 987.50)
    assert r.status == rc.FIXABLE and r.rows[0].fix == {"value": 687.50}
    assert r.difference == -200.00


def test_missing_row_needs_review():
    rows = [rc.Row("ORCA", 30, 10.00, 300.00)]
    r = rc.reconcile(rows, 987.50)
    assert r.status == rc.NEEDS_REVIEW and "off by $687.50" in r.message


def test_no_printed_total_cannot_be_verified():
    r = rc.reconcile([rc.Row("ORCA", 30, 10.00, 300.00)], None)
    assert r.status == rc.NO_TOTAL


def test_rounding_on_screen_is_not_a_misread():
    # 3.3333 shares shown, price and value rounded to the cent
    r = rc.reconcile([rc.Row("HLCN", 3.3333, 98.10, 327.00)], 327.00)
    assert r.status == rc.OK


# ---------- the board: small fund slices fold back into the fund ----------

from stone.portfolio.exposure import OWN_ROW_MIN_SHARE, board_rows  # noqa: E402


def test_a_slice_gets_its_own_row_at_one_percent_not_below():
    assert OWN_ROW_MIN_SHARE == 0.01
    # $10,000 of FUND; A is 1.00% of everything, B is 0.99%
    rows = board_rows({"FUND": 10_000.0}, {"FUND": {"A": 0.01, "B": 0.0099}})
    assert "A" in rows and "B" not in rows
    assert rows["FUND"].children == {"B": pytest.approx(99.0)}


def test_fund_row_keeps_what_you_hold_directly_and_what_it_stands_for():
    rows = board_rows({"FUND": 10_000.0}, {"FUND": {"A": 0.30, "B": 0.005}})
    fund = rows["FUND"]
    assert fund.direct == 10_000  # you own the whole fund directly
    assert fund.shown == pytest.approx(7_000)  # everything not split out: 6,950 unlisted + 50 of B folded in
    assert rows["A"].shown == pytest.approx(3_000) and rows["A"].via_etf == {"FUND": pytest.approx(3_000)}


def test_a_small_stock_you_hold_directly_keeps_its_row():
    rows = board_rows({"A": 10.0, "FUND": 10_000.0}, {"FUND": {"A": 0.001}})
    assert rows["A"].direct == 10 and rows["A"].shown == pytest.approx(20)


def test_board_rows_always_add_up_to_what_you_hold():
    values = {"A": 500.0, "F1": 4_000.0, "F2": 2_000.0}
    weights = {"F1": {"A": 0.2, "B": 0.004, "C": 0.5}, "F2": {"B": 0.001, "C": 0.3}}
    rows = board_rows(values, weights)
    assert sum(r.shown for r in rows.values()) == pytest.approx(sum(values.values()))
    assert "B" not in rows and rows["F1"].children["B"] == pytest.approx(16) and rows["F2"].children["B"] == pytest.approx(2)
