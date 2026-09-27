"""The engine's statistics are hand-written (no numpy at runtime). These tests check them against
statsmodels and scipy, the standard implementations, on every case shape the engine can meet."""

import itertools

import pytest
from scipy.stats import binom
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.proportion import proportion_confint

from stone.signals import engine

CASES = [(h, n) for n in (1, 2, 5, 9, 10, 12, 15, 20, 37, 60, 125, 439) for h in sorted({0, 1, n // 3, n // 2, n - 1, n})]


@pytest.mark.parametrize("hits,n", CASES)
def test_wilson_matches_statsmodels(hits, n):
    low, high = engine.wilson(hits, n)
    ref_low, ref_high = proportion_confint(hits, n, alpha=0.10, method="wilson")
    assert low == pytest.approx(ref_low, abs=1e-12)
    assert high == pytest.approx(ref_high, abs=1e-12)


@pytest.mark.parametrize("k,n,p", [(k, n, p) for n in (10, 12, 15, 40) for k in (0, 1, n // 2, n - 1, n, n + 1)
                                   for p in (0.26, 0.38, 0.46, 0.51)])
def test_binomial_tail_matches_scipy(k, n, p):
    # binom_sf(k) is P(X >= k); scipy's sf(k - 1) is the same tail
    assert engine.binom_sf(k, n, p) == pytest.approx(binom.sf(k - 1, n, p), rel=1e-9, abs=1e-15)


PVALUE_SETS = [
    [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216],
    [0.2, 0.2, 0.2, 0.01, 0.9],
    [0.5] * 7,
    [0.0001],
    [0.04, 0.03, 0.02, 0.01],
    [0.011, 0.02, 0.029, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 0.02, 0.031],
]


@pytest.mark.parametrize("pvalues", PVALUE_SETS)
def test_benjamini_hochberg_matches_statsmodels(pvalues):
    reject, *_ = multipletests(pvalues, alpha=0.10, method="fdr_bh")
    assert engine.benjamini_hochberg(pvalues, q=0.10) == list(reject)


def test_benjamini_hochberg_matches_on_every_small_grid():
    grid = (0.001, 0.02, 0.05, 0.09, 0.3)
    for pvalues in itertools.product(grid, repeat=4):
        reject, *_ = multipletests(list(pvalues), alpha=0.10, method="fdr_bh")
        assert engine.benjamini_hochberg(list(pvalues), q=0.10) == list(reject), pvalues
