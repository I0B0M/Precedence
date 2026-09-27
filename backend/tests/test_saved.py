"""The saved demo data gets `strict` and the current hold-out verdict, rebuilt from its own files."""

import json
import shutil

import pytest

from stone import saved
from stone.config import REPO_DIR

SAVED = REPO_DIR / "frontend" / "public" / "saved"


@pytest.fixture
def out(tmp_path):
    root = shutil.copytree(SAVED, tmp_path / "saved")
    saved.finish(root)
    return root


def read(root, path):
    return json.loads((root / path).read_text())


def test_amazon_s_hold_out_says_too_few_cases_not_held_up(out):
    amzn = next(s for s in read(out, "companies/AMZN.json")["signals"] if s["signal"] == "insider_cluster")
    assert (amzn["holdout"]["verdict"], amzn["holdout"]["held_up"]) == ("too few cases to check", False)
    market = read(out, "market/rate_jump.json")["holdout"]
    assert (market["verdict"], market["held_up"]) == ("too few cases to check", False)


def test_amazon_carries_the_stricter_test_behind_borderline(out):
    lab = read(out, "lab/AMZN/insider_cluster.json")
    assert lab["label"] == "STRONG"  # the label never changes
    assert lab["strict"]["p"] == pytest.approx(0.104, abs=0.001)
    assert lab["strict"]["diff_low"] < 0 < lab["strict"]["diff_high"]


def test_board_and_fund_entries_take_strict_from_the_full_result(out):
    board = read(out, "portfolio/AAPL-10_AMZN-10_BX-10_JPM-10_NVDA-10_SPY-5.json")
    amzn = next(e for e in board["exposure"] if e["symbol"] == "AMZN")
    insider = next(r for r in amzn["firing"] if r["signal"] == "insider_cluster")
    assert insider["strict"] == read(out, "lab/AMZN/insider_cluster.json")["strict"]
    assert insider["holdout"]["verdict"] == "too few cases to check"
    spy = read(out, "funds/SPY.json")["fund_firing"][0]
    assert spy["strict"] == read(out, "market/rate_jump.json")["strict"]


def test_fewer_than_ten_cases_has_no_strict(out):
    assert read(out, "lab/JPM/insider_cluster.json")["strict"] is None  # 8 cases


def test_running_it_twice_changes_nothing(out):
    before = {p: p.read_text() for p in out.rglob("*.json")}
    saved.finish(out)
    assert {p: p.read_text() for p in out.rglob("*.json")} == before
