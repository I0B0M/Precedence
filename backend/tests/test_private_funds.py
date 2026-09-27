import os
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app  # noqa: E402
from stone.figures import html_to_text  # noqa: E402
from stone.ingest import sample  # noqa: E402
from stone.ingest.private_funds import collect, store  # noqa: E402
from stone.sources import private_funds as pf  # noqa: E402
from stone.sources.sec import Filing  # noqa: E402

FX = Path(__file__).parent / "fixtures"
text = lambda name: html_to_text((FX / name).read_bytes(), limit=10**9) if name.endswith(".htm") else (FX / name).read_text()
BREIT_AUG26 = text("breit_nav_2026-08.htm")  # 424B3 0001662972-26-000136: one row per class
BREIT_AUG25 = text("breit_nav_2025-08.htm")  # 424B3 0001662972-25-000154: one column per class
BCRED_AUG26 = text("bcred_8k_2026-08.htm")  # 8-K 0001803498-26-000053, Item 8.01
BREIT_10Q = text("breit_10q_2026-06_excerpt.txt")
BCRED_10Q = text("bcred_10q_2026-06_excerpt.txt")


def filing(acc, form, filed, doc):
    return Filing(acc, form, filed, datetime.combine(filed, datetime.min.time(), tzinfo=timezone.utc), None, doc)


def test_breit_nav_from_the_per_class_rows():
    assert pf.parse_nav("BREIT", BREIT_AUG26) == pf.Nav(date(2026, 8, 31), 14.6850)


def test_breit_nav_from_the_older_per_class_columns():
    # header "Class S Class I Class T Class D Class C": Class I is the second value, not the first
    assert pf.parse_nav("BREIT", BREIT_AUG25) == pf.Nav(date(2025, 8, 31), 13.8281)


def test_breit_table_that_disagrees_with_its_own_sentence_is_refused():
    wrong = BREIT_AUG25.replace("Class I NAV per share was $13.83", "Class I NAV per share was $13.82")
    with pytest.raises(pf.NavMismatch):
        pf.parse_nav("BREIT", wrong)


def test_bcred_nav_from_its_8k():
    assert pf.parse_nav("BCRED", BCRED_AUG26) == pf.Nav(date(2026, 8, 31), 23.60)
    # every class is $23.60 that month, so make Class S differ to prove it's Class I being read
    other = BCRED_AUG26.replace("Class S Common Shares $ 23.60", "Class S Common Shares $ 99.99")
    assert other != BCRED_AUG26 and pf.parse_nav("BCRED", other).nav == 23.60


def test_a_filing_without_a_nav_gives_none_not_a_guess():
    assert pf.parse_nav("BREIT", BREIT_10Q) is None and pf.parse_nav("BCRED", BCRED_10Q) is None


def test_what_it_invests_in_and_its_repurchase_limits_are_quoted_from_its_10q():
    assert pf.invests_in("BREIT", BREIT_10Q) == \
        "Invests primarily in stabilized, income-generating commercial real estate in the United States"
    assert pf.invests_in("BCRED", BCRED_10Q) == \
        "Invests primarily in originated loans and other securities … of U.S. private companies"
    for t, doc in (("BREIT", BREIT_10Q), ("BCRED", BCRED_10Q)):
        assert len(pf.invests_in(t, doc).replace("…", "").split()) <= 12
    assert pf.liquidity_note("BREIT", BREIT_10Q) == ('Repurchases are "limited to no more than 2% of our aggregate NAV '
                                                     'per month … and no more than 5% of our aggregate NAV per calendar quarter"')
    assert pf.liquidity_note("BCRED", BCRED_10Q) == (
        '"the Company may repurchase, in each quarter, up to 5% of the NAV of the Company’s Common Shares outstanding '
        '… as of the close of the previous calendar quarter", at the discretion of the Board')
    assert pf.invests_in("BREIT", BCRED_10Q) is None  # one fund's wording never fills in for another's


def test_month_back_lands_on_month_ends():
    assert pf.month_back(date(2026, 3, 31), 1) == date(2026, 2, 28)
    assert pf.month_back(date(2026, 8, 31), 12) == date(2025, 8, 31)
    assert pf.month_back(date(2026, 1, 31), 3) == date(2025, 10, 31)


BREIT_FILINGS = [  # newest first, as EDGAR lists them
    filing("0001662972-26-000136", "424B3", date(2026, 9, 16), "breitnavaugust2026.htm"),
    filing("0001662972-26-000111", "10-Q", date(2026, 8, 7), "breit-20260630.htm"),
    filing("0001193125-26-001583", "424B3", date(2026, 1, 5), "d215198d424b3.htm"),  # a supplement with no NAV
    filing("0001662972-25-000154", "424B3", date(2025, 9, 19), "breitnavaugust2025.htm"),
]
TEXTS = {"0001662972-26-000136": BREIT_AUG26, "0001662972-26-000111": BREIT_10Q,
         "0001193125-26-001583": BREIT_10Q, "0001662972-25-000154": BREIT_AUG25}


def test_collect_keeps_every_nav_with_its_own_filing():
    load = collect(pf.FUNDS["BREIT"], BREIT_FILINGS, lambda f: TEXTS[f.accession], date(2025, 5, 31))
    assert {d: (v, f.accession) for d, (v, f) in load.navs.items()} == {
        date(2026, 8, 31): (14.685, "0001662972-26-000136"), date(2025, 8, 31): (13.8281, "0001662972-25-000154")}
    assert [f.accession for f in load.skipped] == ["0001193125-26-001583"]
    assert load.invests_in[1].endswith("/1662972/000166297226000111/breit-20260630.htm")
    assert [f.form for f in load.links] == ["10-Q", "424B3"]  # no 10-K in this list


def test_two_filings_giving_one_month_different_navs_stop_the_load():
    restated = filing("0001662972-26-000999", "424B3", date(2026, 9, 20), "restated.htm")
    texts = {**TEXTS, restated.accession: BREIT_AUG26.replace("$ 14.6850", "$ 14.7000")
                                                     .replace("was $14.69", "was $14.70")}
    with pytest.raises(pf.ConflictingNav):
        collect(pf.FUNDS["BREIT"], [restated, *BREIT_FILINGS], lambda f: texts[f.accession], date(2025, 5, 31))


@pytest.fixture
def conn():
    c = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(c)
    sample.seed(c, date(2026, 9, 26))
    wipe = lambda: [c.execute(f"delete from {t}") for t in ("private_fund_filings", "private_fund_navs",
                                                            "private_fund_distributions", "private_funds")]
    wipe()
    store(c, collect(pf.FUNDS["BREIT"], BREIT_FILINGS, lambda f: TEXTS[f.accession], date(2025, 5, 31)))
    c.commit()
    yield c
    wipe()
    c.commit()
    c.close()


def test_storing_is_additive_and_refuses_a_changed_month(conn):
    load = collect(pf.FUNDS["BREIT"], BREIT_FILINGS, lambda f: TEXTS[f.accession], date(2025, 5, 31))
    assert store(conn, load) == 0  # nothing new the second time
    load.navs[date(2026, 8, 31)] = (15.0, load.navs[date(2026, 8, 31)][1])
    with pytest.raises(pf.ConflictingNav):
        store(conn, load)


def test_private_fund_page_prices_by_monthly_nav_from_filings(conn):
    p = TestClient(app).get("/api/funds/breit").json()
    assert p["kind"] == "private_fund" and p["pricing"] == "monthly NAV" and p["holdings"] == [] and p["state"] is None
    assert p["nav"]["value"] == 14.685 and p["nav"]["as_of"] == "2026-08-31" and p["nav"]["share_class"] == "I"
    assert p["nav"]["url"].endswith("/000166297226000136/breitnavaugust2026.htm") and p["nav"]["form"] == "424B3"
    assert [h["as_of"] for h in p["history"]] == ["2025-08-31", "2026-08-31"]  # oldest first
    assert p["returns"]["m12"] == pytest.approx(14.685 / 13.8281 - 1)
    assert p["returns"]["m1"] is None and p["returns"]["m3"] is None  # no filed NAV for July or May: no number
    assert p["returns"]["basis"] == "monthly NAV, class I, distributions not included"
    assert p["invests_in"]["text"].startswith("Invests primarily in stabilized") and p["liquidity_url"]
    assert {f["form"] for f in p["filings"]} == {"10-Q", "424B3"}
    assert p["source"] == "SEC EDGAR: BREIT monthly 424B3 NAV supplements"


def test_portfolio_values_a_private_fund_at_the_amount_entered(conn):
    client = TestClient(app)
    body = client.post("/api/portfolio", json={"holdings": [{"symbol": "HLCN", "shares": 1}],
                                               "other": [{"kind": "private_fund", "fund": "breit", "amount": 10000}]}).json()
    [row] = body["private_funds"]
    assert row["fund"] == "BREIT" and row["amount"] == 10000 and row["state"] is None
    assert row["nav"] == 14.685 and row["nav_as_of"] == "2026-08-31" and row["shares"] == pytest.approx(10000 / 14.685)
    s = body["subtotals"]
    assert s["private_funds"] == 10000 and s["total"] == pytest.approx(s["investments"] + 10000)
    assert "BREIT" not in {e["symbol"] for e in body["exposure"]}  # no daily prices: not on the board
    assert body["total"] == pytest.approx(sum(e["total"] for e in body["exposure"]))
    bad = lambda other: client.post("/api/portfolio", json={"holdings": [], "other": [other]}).status_code
    assert bad({"kind": "private_fund", "fund": "BXPE", "amount": 5}) == 422
    assert bad({"kind": "private_fund", "fund": "BREIT"}) == 422
