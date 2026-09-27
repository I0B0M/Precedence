import os
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api.main import app, total_return  # noqa: E402
from stone.figures import html_to_text  # noqa: E402
from stone.ingest import sample  # noqa: E402
from stone.ingest.private_funds import collect, store  # noqa: E402
from stone.sources import private_funds as pf  # noqa: E402
from stone.sources.sec import Filing  # noqa: E402

FX = Path(__file__).parent / "fixtures"
text = lambda name: html_to_text((FX / name).read_bytes(), limit=10**9)
D = pf.Distribution


def filing(acc, form, filed, doc):
    return Filing(acc, form, filed, datetime.combine(filed, datetime.min.time(), tzinfo=timezone.utc), None, doc)


def test_breit_monthly_8k_declares_the_class_i_distribution():
    assert pf.parse_distributions(text("breit_8k_dist_2026-08.htm")) == [D(date(2026, 8, 31), 0.0557, date(2026, 8, 31))]


def test_breit_class_i_row_is_found_when_it_isnt_first():
    # September 2025 lists Class S, S-2, then Class I; the gross column, not the fee or net column
    assert pf.parse_distributions(text("breit_8k_dist_2025-09.htm")) == [D(date(2025, 9, 30), 0.0548, date(2025, 9, 30))]


def test_bcred_8k_with_this_months_table_and_next_months_advance_notice():
    assert pf.parse_distributions(text("bcred_8k_2026-06.htm")) == [
        D(date(2026, 6, 30), 0.20, date(2026, 6, 30)), D(date(2026, 7, 31), 0.18, date(2026, 7, 31))]


def test_bcred_restated_as_previously_disclosed():
    assert pf.parse_distributions(text("bcred_8k_2026-07.htm")) == [D(date(2026, 7, 31), 0.18, date(2026, 7, 31))]
    assert pf.parse_distributions(text("bcred_8k_2026-08.htm")) == [D(date(2026, 9, 30), 0.18, date(2026, 9, 30))]


def test_a_filing_is_refused_rather_than_half_read():
    t = text("bcred_8k_2026-06.htm")
    with pytest.raises(pf.UnreadableDistribution):  # a second declaration we can't read
        pf.parse_distributions(t.replace("of $0.1800 per Share", "of about eighteen cents per Share"))
    with pytest.raises(pf.UnreadableDistribution):
        pf.parse_distributions(t.replace("regular distributions for each class", "special distribution for each class"))
    with pytest.raises(pf.UnreadableDistribution):  # "June 2026 Distributions" paid to holders of record in July
        pf.parse_distributions(t.replace("open of business on June 30, 2026", "open of business on July 1, 2026"))
    assert pf.parse_distributions(text("breit_nav_2026-08.htm")) == []  # a NAV supplement declares none
    # the regular table still reads, but an extra payout without its own heading would be missed: refuse the filing
    extra = text("bcred_8k_2026-07.htm").replace(
        "Item 8.01", "In addition, the Fund declared a special distribution of $0.0500 per Share. Item 8.01", 1)
    with pytest.raises(pf.UnreadableDistribution, match="special"):
        pf.parse_distributions(extra)


BCRED_FILINGS = [  # newest first
    filing("0001803498-26-000053", "8-K", date(2026, 9, 22), "bcred-20260921.htm"),
    filing("0001803498-26-000051", "8-K", date(2026, 8, 20), "bcred-20260819.htm"),
    filing("0001803498-26-000039", "8-K", date(2026, 7, 23), "bcred-20260722.htm"),
    filing("0001803498-26-000036", "8-K", date(2026, 6, 23), "bcred-20260622.htm"),
]
TEXTS = {"0001803498-26-000053": text("bcred_8k_2026-08.htm"), "0001803498-26-000051": text("bcred_8k_2026-08-20.htm"),
         "0001803498-26-000039": text("bcred_8k_2026-07.htm"), "0001803498-26-000036": text("bcred_8k_2026-06.htm")}
load_bcred = lambda texts=TEXTS: collect(pf.FUNDS["BCRED"], BCRED_FILINGS, lambda f: texts[f.accession], date(2025, 5, 31))


def test_collect_ties_each_month_to_the_8k_that_declares_it():
    d = load_bcred().distributions
    assert {m: (a, f.accession) for m, (a, _, f) in d.items()} == {
        date(2026, 9, 30): (0.18, "0001803498-26-000053"), date(2026, 8, 31): (0.18, "0001803498-26-000051"),
        date(2026, 7, 31): (0.18, "0001803498-26-000039"),  # the restatement, newest first; the advance notice agreed
        date(2026, 6, 30): (0.20, "0001803498-26-000036")}


def test_an_advance_notice_and_its_restatement_disagreeing_stop_the_load():
    texts = {**TEXTS, "0001803498-26-000039": TEXTS["0001803498-26-000039"].replace("$ 0.1800 $ 0.0000 $ 0.1800",
                                                                                   "$ 0.1900 $ 0.0000 $ 0.1900")}
    with pytest.raises(pf.ConflictingDistribution):
        load_bcred(texts)


def test_an_unreadable_8k_leaves_its_month_missing():
    texts = {**TEXTS, "0001803498-26-000051": TEXTS["0001803498-26-000051"].replace("regular distributions", "special distribution")}
    load = load_bcred(texts)
    assert date(2026, 8, 31) not in load.distributions and [f.accession for f, _ in load.unreadable] == ["0001803498-26-000051"]


def test_total_return_adds_the_months_distributions_and_never_fills_a_gap():
    navs = {date(2026, 5, 31): 10.0, date(2026, 6, 30): 10.1, date(2026, 7, 31): 10.0}
    paid = {date(2026, 6, 30): 0.05, date(2026, 7, 31): 0.05}
    assert total_return(navs, paid, date(2026, 7, 31), 1) == pytest.approx((10.0 + 0.05) / 10.1 - 1)
    assert total_return(navs, paid, date(2026, 7, 31), 2) == pytest.approx((10.0 + 0.10) / 10.0 - 1)
    assert total_return(navs, {date(2026, 7, 31): 0.05}, date(2026, 7, 31), 2) is None  # June's distribution unknown
    assert total_return(navs, paid, date(2026, 7, 31), 3) is None  # no NAV for April


@pytest.fixture
def conn():
    c = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(c)
    sample.seed(c, date(2026, 9, 26))
    wipe = lambda: [c.execute(f"delete from {t}") for t in ("private_fund_filings", "private_fund_navs",
                                                            "private_fund_distributions", "private_funds")]
    wipe()
    store(c, load_bcred())
    c.commit()
    yield c
    wipe()
    c.commit()
    c.close()


def test_store_is_additive_for_distributions_and_refuses_a_changed_month(conn):
    load = load_bcred()
    assert store(conn, load) == 0 and conn.execute("select count(*) as n from private_fund_distributions").fetchone()["n"] == 4
    amount, record, fl = load.distributions[date(2026, 6, 30)]
    load.distributions[date(2026, 6, 30)] = (0.25, record, fl)
    with pytest.raises(pf.ConflictingDistribution):
        store(conn, load)


def test_fund_page_shows_distributions_and_total_return_next_to_nav_change(conn):
    p = TestClient(app).get("/api/funds/BCRED").json()
    assert [(d["month"], d["amount"]) for d in p["distributions"]] == [
        ("2026-06-30", 0.2), ("2026-07-31", 0.18), ("2026-08-31", 0.18), ("2026-09-30", 0.18)]
    assert all(d["url"].startswith("https://www.sec.gov/Archives/edgar/data/1803498/") for d in p["distributions"])
    # NAVs from these 8-Ks: May 31 23.94, Jun 30 23.65, Jul 31 23.64, Aug 31 23.60
    tr = p["total_return"]
    assert tr["m1"] == pytest.approx((23.60 + 0.18) / 23.64 - 1)  # August's distribution, not September's
    assert tr["m3"] == pytest.approx((23.60 + 0.20 + 0.18 + 0.18) / 23.94 - 1)
    assert tr["m12"] is None  # no NAV for August 2025 in these filings
    assert tr["basis"] == "NAV change plus distributions paid, not reinvested, Class I"
    assert p["returns"]["m1"] == pytest.approx(23.60 / 23.64 - 1)  # the NAV-only number is still there
