from stone import retirement as rt


def test_only_sp500_trackers_are_an_exact_index_match_for_spy():
    for ticker in ("FXAIX", "VFIAX", "VFINX", "SWPPX"):
        f = rt.lookup(ticker)
        assert f["behaves_like"] == "SPY" and f["match"] == "exact index", ticker
        assert "S&P 500" in f["basis"] and f["source"], ticker


def test_total_market_funds_are_a_close_stand_in_and_say_so():
    for ticker in ("FSKAX", "VTSAX", "SWTSX"):
        f = rt.lookup(ticker)
        assert f["behaves_like"] == "SPY" and f["match"] == "close stand-in", ticker


def test_target_date_bond_and_international_funds_are_not_mapped():
    for ticker, category in (("VFIFX", "Target date"), ("VBTLX", "Bond"), ("VTIAX", "International")):
        f = rt.lookup(ticker)
        assert f["behaves_like"] is None and f["match"] is None and f["category"] == category, ticker
        assert "not tested" in f["note"].lower(), ticker


def test_lookup_by_name_and_unknown_funds():
    assert rt.lookup(" fxaix ")["ticker"] == "FXAIX"
    assert rt.lookup("Fidelity 500 Index Fund")["ticker"] == "FXAIX"  # as it's printed on a statement
    unknown = rt.lookup("Acme Stable Value Fund")
    assert unknown["ticker"] is None and unknown["behaves_like"] is None and "not in" in unknown["note"].lower()
