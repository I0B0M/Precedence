from datetime import date

import pytest

from stone import figures as fg


def fact(concept, value, period_end=date(2026, 2, 25)):
    return {"concept": concept, "value": value, "period_end": period_end}


def test_printed_precision_counts_significant_digits():
    assert fg.printed_sig_digits("$5.0 billion") == 2
    assert fg.printed_sig_digits("$5,041 million") == 4
    assert fg.printed_sig_digits("$(1.23)") == 3
    assert fg.printed_sig_digits("0.05") == 1
    assert fg.printed_sig_digits("no number here") is None


def test_a_figure_matches_when_xbrl_rounded_to_the_printed_precision_agrees():
    assert fg.figures_match(5.0e9, "$5.0 billion", 5_039_780_223) is True  # 5.04bn prints as 5.0
    assert fg.figures_match(5.1e9, "$5.1 billion", 5_039_780_223) is False  # the misread is shown, not hidden
    assert fg.figures_match(5.041e9, "$5,041 million", 5_039_780_223) is False  # printed to 4 digits: 5,040 != 5,041
    assert fg.figures_match(1.23, "$1.23", 1.23) is True
    assert fg.figures_match(-4.2e8, "$(420) million", -422_401_137) is True
    assert fg.figures_match(4.2e8, "$420 million", -422_401_137) is False  # a loss stated as a profit
    assert fg.figures_match(None, "$5.0 billion", 5e9) is None
    assert fg.figures_match(5e9, "$5.0 billion", None) is None


def test_check_uses_the_filings_own_xbrl_for_that_concept_and_date():
    facts = [fact("Revenues", 5_039_780_223), fact("NetIncomeLoss", 422_401_137), fact("Assets", 32_758_571_449),
             fact("Revenues", 4_800_000_000, date(2025, 2, 25))]  # prior-year comparison in the same filing
    stated = [
        {"label": "Revenue", "kind": "revenue", "text_value": "$5.0 billion", "value": 5.0e9, "period_end": "2026-02-25"},
        {"label": "Net income", "kind": "net_income", "text_value": "$431 million", "value": 4.31e8,
         "period_end": "2026-02-25"},
        {"label": "Assets", "kind": "total_assets", "text_value": "$32.8 billion", "value": 3.28e10, "period_end": None},
        {"label": "Stores", "kind": "other", "text_value": "1,204", "value": 1204, "period_end": None},
        {"label": "Cash", "kind": "cash", "text_value": "$900 million", "value": 9e8, "period_end": "2026-02-25"},
    ]
    rev, ni, assets, other, cash = fg.check_figures(stated, facts)
    assert rev["match"] is True and rev["concept"] == "us-gaap:Revenues" and rev["xbrl_value"] == 5_039_780_223
    assert ni["match"] is False and ni["xbrl_value"] == 422_401_137  # never hidden
    assert assets["match"] is True  # no date given: checked against the filing's latest date for that concept
    assert other["match"] is None and other["concept"] is None  # nothing to check "other" against
    assert cash["match"] is None and cash["xbrl_value"] is None  # the filing has no cash fact
    # last year's revenue stated as this quarter's: right number, wrong date, so it does not match
    [wrong_date] = fg.check_figures([{"label": "Revenue", "kind": "revenue", "text_value": "$4.8 billion",
                                      "value": 4.8e9, "period_end": "2026-02-25"}], facts)
    assert wrong_date["match"] is False and wrong_date["xbrl_value"] == 5_039_780_223


def test_revenue_checks_every_concept_companies_use_for_revenue():
    facts = [fact("RevenueFromContractWithCustomerExcludingAssessedTax", 5_039_780_223)]
    [r] = fg.check_figures([{"label": "Revenue", "kind": "revenue", "text_value": "$5.0 billion", "value": 5e9,
                             "period_end": "2026-02-25"}], facts)
    assert r["match"] is True and r["concept"] == "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax"


def test_html_to_text_drops_markup_scripts_and_styles():
    html = b"<html><style>.x{}</style><script>var a=1</script><p>Revenue was <b>$5.0&nbsp;billion</b>.</p></html>"
    assert fg.html_to_text(html) == "Revenue was $5.0 billion."
    assert len(fg.html_to_text(b"<p>" + b"word " * 100_000 + b"</p>", limit=1000)) <= 1000


@pytest.mark.parametrize("kind", sorted(fg.KIND_CONCEPTS))
def test_every_kind_maps_to_real_us_gaap_names(kind):
    assert all(c[0].isupper() and " " not in c for c in fg.KIND_CONCEPTS[kind])
