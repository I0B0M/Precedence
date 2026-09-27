# ML/AI baselines: what Precedence can borrow from high-star public repos

Research for Precedence (ShellHacks 2026, Blackstone track), 2026-09-26/27. The question: which well-known, high-star
open-source repos and papers are the baseline for Precedence's statistics and AI reading, what exact code could Precedence
borrow, and how does Precedence's own code compare? Checked against primary sources: source code at pinned commits,
official docs and the papers. Star counts and licenses were checked live with `gh api` on 2026-09-27.
**Verified** means read or run on those dates; anything else is marked **unverified**.

What has landed from this so far: commit `909bb4a` on branch `ml-baselines` (on top of `ml-ai-demo` `3f1e23b`).
It is tests only, plus one docstring: `newcombe()` checked against statsmodels, and normal periods against AFML
average uniqueness. No label or number changed.

## The short version

1. **Precedence's STRONG rule is a known test.** "The Wilson 90% low end beats the normal rate" is exactly the one-sided
   5% generalized sign test of Cowan (1992), run on one stock's events instead of many firms. The two never disagreed
   in 8,078,154 cases, and a separate re-check on 1,303,134 cases found no disagreement either. Describe it as "a
   one-stock version of Cowan's generalized sign test" (section 1.2).
2. **The stricter test's range is Newcombe (1998) method 10, identical to statsmodels.** `newcombe()` matches
   statsmodels 0.15.0 `confint_proportions_2indep(method="newcomb")` to 1e-15 on 25,713 cases, including AMZN's
   fractional one. This is now a test (section 1.1).
3. **"Normal periods" is López de Prado's average uniqueness** (*Advances in Financial Machine Learning*, ch. 4).
   The two give the same number to 2e-14 on 2,705 random patterns. This is now a test too (section 1.3).
4. **The AI only reads, and something else checks it.** Google's docs recommend exactly this: "always validate
   values in your application". Precedence's reconcile and XBRL checks go further than the Gemini cookbook, zerox or
   instructor. Those retry on errors or reask the model, but none of them checks the arithmetic (section 2).
5. **Honest caveat for AMZN's Heads up.** Every sale filing in the cluster that is firing (7 filings, 2026-08-25 to
   09-03) is a pre-planned Rule 10b5-1 sale (`<aff10b5One>1</aff10b5One>`). So are 20 of the 22 AMZN sale filings
   sampled since 2023-04. Cohen, Malloy & Pomorski (2012) find such routine sales carry little information. Pro
   already calls AMZN borderline: the stricter test gives p = 0.10, and the exact binomial p is 0.060 (section 3).

## What to change, and when

The STRONG rule stays as it is for the demo. Changes that would move a label wait for the rule decision after it.

| Change | Borrowed from | Changes a label? | Effort |
|---|---|---|---|
| README "Research used": add Cowan (1992) and López de Prado (2018) ch. 4 | the papers | No | 5 min |
| Pro wording: "a one-stock generalized sign test (Cowan 1992)", with the exact binomial p shown next to STRONG | estudy2, eventstudytools | No | 15 min |
| Gemini: log which request format was accepted, have `check_gemini.py` print it, then run it once with an empty cache | python-genai, the Gemini docs | No | 10 min |
| Gemini: put the text prompt before the image | the image-understanding guide | No | 1 min |
| Filing figures: a figure whose quoted text isn't in the source text is "not found in the filing" | LangExtract's source alignment | No | 10 min |
| Filing text: keep table rows as `\| a \| b \|` lines (Appendix A) | markitdown's approach, stdlib only | No | 15 min |
| Earnings 8-Ks: summarize EX-99.1 instead of the cover page, and check against the 10-Q/10-K XBRL | edgartools `CurrentReport.press_releases` | No | 20–30 min |
| Form 4: parse and store the 10b5-1 flag, then add a Pro note such as "7 of 7 planned" | edgartools `_parse_aff10b5_one` | No | 35–50 min |
| Screenshot that doesn't add up: one independent second read, merged by agreement, never a reask that shows the total | self-consistency (Wang et al. 2022), not instructor's reask | No | 25–40 min + UI |
| The average path after events, next to normal days | alphalens `create_event_study_tear_sheet` | No | 45 min |
| Remove skipped overlapping events' windows from normal days (`ml-ai-strict-rule` already does) | — | **Yes** | 10 min + re-export |
| Judge STRONG on the exact binomial or the Newcombe range, not the normal approximation | statsmodels, scipy | **Yes** | with the rule decision |
| Leave planned sales out of clusters, filter routine sellers, count distinct insiders, weight by size | Cohen-Malloy-Pomorski, edgartools, OpenBB | **Yes** | 45–60 min |

## 1. Signal statistics

Scope: newcombe() vs statsmodels, Cowan's generalized sign test, `normal_periods` vs AFML
average uniqueness, and the alphalens event-study tear sheet. `wilson()`, `binom_sf()` and `benjamini_hochberg()` are
already checked against statsmodels/scipy on branch `repos-upgrade` (`backend/tests/test_stats_vs_statsmodels.py`), so
they are not repeated here.

Precedence code checked: `backend/stone/signals/engine.py` at `4935125`, and at `619ff32` for `window_days` /
`normal_starts` / `periods_spanned`. (A stray `if False` in `test_signal` seen mid-run came from an interrupted
mutation-check run; the file was restored, and the committed code is what was tested.) Reference versions:
statsmodels 0.15.0, scipy 1.18.1, numpy 2.5.3, in a throwaway venv. The scratch scripts stayed outside the repo;
the Newcombe and uniqueness checks are now tests in `backend/tests/test_engine.py` (commit `909bb4a`).

| Repo | Stars (live, 2026-09-27) | License | What to borrow (path::function) | How Precedence compares |
|---|---|---|---|---|
| [statsmodels/statsmodels](https://github.com/statsmodels/statsmodels) | 11,655 | BSD-3-Clause | [`statsmodels/stats/proportion.py::confint_proportions_2indep(method="newcomb")`](https://github.com/statsmodels/statsmodels/blob/18dbcdf94a2918c1ef0931e14578044ef8815751/statsmodels/stats/proportion.py#L1546-L1552), built on [`proportion_confint(method="wilson")`](https://github.com/statsmodels/statsmodels/blob/18dbcdf94a2918c1ef0931e14578044ef8815751/statsmodels/stats/proportion.py#L288-L296) | **Same formula.** Largest difference 5.6e-16 over 25,713 cases, fractional counts included (details below). statsmodels has no Newcombe *test* ([L2128-L2130](https://github.com/statsmodels/statsmodels/blob/18dbcdf94a2918c1ef0931e14578044ef8815751/statsmodels/stats/proportion.py#L2128-L2130): "newcomb not available for hypothesis test"), so Precedence's p from inverting the range has no library to check it against. |
| [irudnyts/estudy2](https://github.com/irudnyts/estudy2) (R, CRAN) | 14 | none in the GitHub API (CRAN lists GPL-3, unverified) | [`R/nonparametric_tests.R::generalized_sign_test`](https://github.com/irudnyts/estudy2/blob/14946383b9d168b1b97ebdd2a1797a2b93ba1eb4/R/nonparametric_tests.R#L357) (Cowan 1992). The same file also has `corrado_sign_test` and `rank_test`. | Uses the same statistic as Precedence's STRONG rule (proof below). Differences: estudy2 works across firms, one AR sign per day, and takes p̂ from single days. Precedence works across one stock's events, uses the sign of the h-day return, and takes the normal rate from h-day windows. Read for reference only; nothing to copy. |
| [eventstudytools.com docs](https://www.eventstudytools.com/significance-tests) | n/a | docs | Formula for "Generalized Sign Z (Cowan 1992)" | Primary documentation of the statistic Precedence's rule matches (below). |
| [quantopian/alphalens](https://github.com/quantopian/alphalens) | 4,456 | Apache-2.0 (last push 2024-02) | [`alphalens/tears.py::create_event_study_tear_sheet`](https://github.com/quantopian/alphalens/blob/77084f1e4c2c0be407e032d444fb19e4be4b0f37/alphalens/tears.py#L636), [`tears.py::create_event_returns_tear_sheet`](https://github.com/quantopian/alphalens/blob/77084f1e4c2c0be407e032d444fb19e4be4b0f37/alphalens/tears.py#L530), [`performance.py::average_cumulative_return_by_quantile`](https://github.com/quantopian/alphalens/blob/77084f1e4c2c0be407e032d444fb19e4be4b0f37/alphalens/performance.py#L730), [`performance.py::common_start_returns`](https://github.com/quantopian/alphalens/blob/77084f1e4c2c0be407e032d444fb19e4be4b0f37/alphalens/performance.py#L642), [`plotting.py::plot_quantile_average_cumulative_return`](https://github.com/quantopian/alphalens/blob/77084f1e4c2c0be407e032d444fb19e4be4b0f37/alphalens/plotting.py#L815), [`utils.py::compute_forward_returns`](https://github.com/quantopian/alphalens/blob/77084f1e4c2c0be407e032d444fb19e4be4b0f37/alphalens/utils.py#L216) | Standard baseline for the "average path after events" chart: mean cumulative return by day relative to the event, with a ±std band. Precedence has no path chart, only the end-of-horizon return and hit. See below. |
| [stefan-jansen/alphalens-reloaded](https://github.com/stefan-jansen/alphalens-reloaded) | 657 | Apache-2.0 (maintained, push 2025-12) | The same functions under `src/alphalens/`: [`tears.py::create_event_study_tear_sheet` L614](https://github.com/stefan-jansen/alphalens-reloaded/blob/f0a07c22d554e4b4036983cc80320b432714fe7e/src/alphalens/tears.py#L614), [`performance.py::average_cumulative_return_by_quantile` L758](https://github.com/stefan-jansen/alphalens-reloaded/blob/f0a07c22d554e4b4036983cc80320b432714fe7e/src/alphalens/performance.py#L758), [`plotting.py::plot_quantile_average_cumulative_return` L872](https://github.com/stefan-jansen/alphalens-reloaded/blob/f0a07c22d554e4b4036983cc80320b432714fe7e/src/alphalens/plotting.py#L872), [`utils.py::compute_forward_returns` L227](https://github.com/stefan-jansen/alphalens-reloaded/blob/f0a07c22d554e4b4036983cc80320b432714fe7e/src/alphalens/utils.py#L227) | Cite this one if you cite a live package. Same logic as the original. |
| [hudson-and-thames/mlfinlab](https://github.com/hudson-and-thames/mlfinlab) | 4,934 | NOASSERTION: a proprietary "Copyright Protection Notice and Licensing Agreement" (Nov 2021) | `mlfinlab/sampling/concurrent.py::num_concurrent_events`, `_get_average_uniqueness`, `get_av_uniqueness_from_triple_barrier` | The public repo is now **stubs** (every body is `pass`), with history squashed to one root commit, [`f71b2bb`](https://github.com/hudson-and-thames/mlfinlab/blob/f71b2bb23d2a83d40993bc70362e0398e7657213/mlfinlab/sampling/concurrent.py). Do not copy from it or from forks that carry its license text (e.g. jmrichardson/mlfinlab, 38 stars). |
| [baobach/mlfinpy](https://github.com/baobach/mlfinpy) | 84 | MIT | [`mlfinpy/sampling/concurrent.py::num_concurrent_events` L11, `_get_average_uniqueness` L51, `get_av_uniqueness_from_triple_barrier` L83](https://github.com/baobach/mlfinpy/blob/89511cc1ee4695beed0044bbbc6665d98ac4a5c5/mlfinpy/sampling/concurrent.py#L11) | A legally usable copy of AFML snippets 4.1 and 4.2 (`count.loc[t_in:t_out] += 1`; `(1.0 / num_conc_events.loc[t_in:t_out]).mean()`). Precedence's `periods_spanned` equals the **sum** of these weights (below). |

### 1.1 newcombe() vs statsmodels `confint_proportions_2indep(method="newcomb")`

- **Same method.** statsmodels computes `d_low = sqrt((p1-low1)^2 + (upp2-p2)^2)` and `d_upp = sqrt((p2-low2)^2 + (upp1-p1)^2)` from two Wilson intervals, with no continuity correction ([proportion.py L1546-L1552 @18dbcdf](https://github.com/statsmodels/statsmodels/blob/18dbcdf94a2918c1ef0931e14578044ef8815751/statsmodels/stats/proportion.py#L1546-L1552)). That is Newcombe (1998) method 10, the same as `engine.newcombe`. Both clip each Wilson interval to [0, 1]: Precedence with `max`/`min`, statsmodels with `np.clip` ([L303-L305](https://github.com/statsmodels/statsmodels/blob/18dbcdf94a2918c1ef0931e14578044ef8815751/statsmodels/stats/proportion.py#L303-L305)).
- **Integer grid:** 5,713 cases, with n1 in {10, 11, 12, 15, 20, 24, 37, 60}, every hits1 from 0 to n1 (so hits=0 and hits=n are included), n2 in {1, 3, 5, 12, 125, 439}, and hits2 in {0, 1, n2/4, n2/2, n2-1, n2}. Largest difference 4.4e-16.
- **Fractional grid:** 20,000 random cases in the shape `strict_evidence` passes, (hits, n, normal_rate x periods, periods). Periods run from 0.37 to 1e6 and the normal rate is 0, 1 or random. Largest difference 5.6e-16.
- **statsmodels does not round or reject non-integer counts.** Only `method="binom_test"` in `proportion_confint` checks for integers. Wilson and newcomb take floats as given, with no warning.
- **AMZN insider cluster at 90%:** `newcombe(6, 12, 32/125*12.9, 12.9)` gives (-0.069656, +0.502476) in Precedence and exactly the same in statsmodels. Precedence's `strict_evidence` p is 0.103505.
- **Newcombe 1998 worked example (a), 56/70 vs 48/80 at 95%:** both give (0.052431, 0.333873), matching the published 0.0524 and 0.3339 that Precedence's test pins. I also ran the other Table II count pairs, for example 9/10 vs 3/10 = (0.1705, 0.8090), 10/10 vs 0/20 = (0.6791, 1.0000) and 0/10 vs 0/10 = (-0.2775, 0.2775). Both libraries agree to 1e-15, but I did not check those against the PDF, so they are **library vs library only, unverified against the paper**.
- **Edge case n2 = 0:** with Python numbers both raise `ZeroDivisionError`. With numpy floats statsmodels returns (nan, nan) plus RuntimeWarnings. `strict_evidence` already returns None when `normal_periods <= 0`, so this can't be reached from the engine.

### 1.2 Is the hit-rate vs normal-days test Cowan's generalized sign test? Yes, in its one-sample, one-sided form.

- **The statistic.** Cowan (1992), "Nonparametric event study tests", *Review of Quantitative Finance and Accounting* 2:343-358, as documented by [eventstudytools.com, "Generalized Sign Z (Cowan 1992)"](https://www.eventstudytools.com/significance-tests):
  `z = (w - N p̂) / sqrt(N p̂ (1 - p̂))`, where `p̂ = (1/N) Σ_i (1/M_i) Σ_{t=T0..T1} 1[AR_{i,t} > 0]` is the positive fraction in the estimation window. `w` is "the number of positive AR_{i,0} (or positive CAR_i)" in the event window.
  The same statistic is in code at [estudy2 `generalized_sign_test`](https://github.com/irudnyts/estudy2/blob/14946383b9d168b1b97ebdd2a1797a2b93ba1eb4/R/nonparametric_tests.R#L357): `(event_binary_sums - n p_hat) / sqrt(n p_hat (1 - p_hat))`. (I did not read the paper itself, which is paywalled. The formula is from those two sources.)
- **Precedence's rule is exactly this z-test at one-sided 5%.** The Wilson interval is the inversion of the score test, and with p0 = the normal rate the score statistic *is* Cowan's z. So "Wilson 90% low end > normal rate" holds exactly when z > 1.6449.
  Checked on **8,078,154** cases (n = 10..200, every w, p0 = k/400): **0 disagreements**. At the edges, p0 = 0 gives STRONG for any w ≥ 1 (z = +∞), and p0 = 1 never gives STRONG. A separate re-check on 1,303,134 cases (n = 10..80) also found 0 disagreements.
- **What maps to what in Precedence:**
  - Cowan's N firms become N non-overlapping events of one stock.
  - w counts h-day returns below zero (market-adjusted for the rate jump, i.e. beta = 1, like Brown-Warner's market-adjusted model), not CARs above zero.
  - p̂ comes from h-day normal windows across the whole history, not from single-day ARs in a pre-event window.
  - The matched horizon is arguably the better null for a multi-day window, but it is not Cowan's p̂. Say "a one-stock, time-series version of Cowan's generalized sign test", not "Cowan's test".
- **The scan's p-value is the exact version of the same test**, `binom_sf(w, n, p0)`. The label uses the normal approximation, and the two disagree in one direction only.
  On n = 10..60 and p0 = 0.01..0.99 (181,764 cases), 2,284 (1.3%) are STRONG with exact p ≥ 0.05, and none go the other way.
  **AMZN is one of them:** 6/12 against a normal rate of 25.6% gives z = 1.937 and Wilson low end 0.2855 > 0.256, so STRONG, but the exact binomial p is **0.0604**. (Label-relevant; the rule is frozen, so this is a flag only.)
- **Corrado:** eventstudytools documents it as `z = (K̄_0 - 0.5) / S_K̄` (Corrado 1989), the rank test, with exchangeable ARs under the null. estudy2 implements `corrado_sign_test`, `rank_test` and `car_rank_test` ([car_nonparametric_tests.R L203](https://github.com/irudnyts/estudy2/blob/14946383b9d168b1b97ebdd2a1797a2b93ba1eb4/R/car_nonparametric_tests.R#L203)). It would test magnitudes, not just signs. Not needed for the demo.

### 1.3 `normal_periods` equals AFML's sum of average uniqueness

- **Definition.** In López de Prado, *Advances in Financial Machine Learning* (2018), ch. 4 snippets 4.1 and 4.2, c_t is the number of labels covering bar t, and the average uniqueness of label i is u_i = mean over t in [t0_i, t1_i] of 1/c_t.
- **Algebra.** With every window h bars long, Σ_i u_i = (1/h) Σ_t Σ_{i∋t} 1/c_t = (1/h) × (number of distinct bars covered). One run of L consecutive start days covers L + h - 1 bars, so it contributes **(L + h - 1)/h**, which is exactly Precedence's formula.
- **Script.** `uniqueness.py` re-implements snippets 4.1 and 4.2 in pandas, with the same lines as mlfinpy L47/L79. It runs 2,705 random event patterns through Precedence's own `window_days` and `normal_starts` (619ff32), with h in {1, 2, 5, 10, 20}. **Largest |periods_spanned - Σ u_i| = 2.1e-14.**
  The engine test's example also gives 5.0 both ways. Single runs: L=125, h=20 gives 7.2 both ways; L=433, h=5 gives 87.4.
  So the 12.9 (AMZN insider) and 90.4 (rate jump) periods quoted for the demo are AFML's number, as long as they come from `normal_starts`.
- **One caveat.** `periods_spanned()` on its own over-counts when two runs' windows overlap: starts [0, 1, 2, 5, 6, 7] with h=5 give 2.8, while AFML gives 2.4. `normal_starts` can't produce that pattern, because a gap between runs requires an event day between their windows, so the runs' windows never touch. One docstring sentence would cover it.
- **Alternative, not verified numerically.** Newey-West or Hansen-Hodrick standard errors with h-1 lags are the regression-style fix for the same overlap. For a 0/1 hit series the effective count is about N / (1 + 2 Σ_{k<h} ρ_k). This equals N/h only when ρ_k = 1 - k/h, which is what overlapping sums of i.i.d. daily signs roughly give for the returns, not exactly for the signs. Precedence's count is the simpler and more conservative choice.

### 1.4 alphalens event-study tear sheet: the baseline for "the average path after events"

- **What `create_event_study_tear_sheet` does.** It sets `long_short = False` (no demeaning) and plots the event distribution. With `avgretplot=(before, after)` it calls `create_event_returns_tear_sheet` and then `performance.average_cumulative_return_by_quantile`.
  That function uses `common_start_returns` to line every event's returns up on a common index from -before to +after, day 0 = the event date. It then takes the mean and std across events for each relative day. `plotting.plot_quantile_average_cumulative_return` draws the mean line, with std bars when `std_bar=True`.
- **What Precedence could build (pure Python, no dependency):** for each case, `path[k] = close[i+k-1] / open[i] - 1` for k = 1..h. Plot the mean (or median) across cases, next to the same mean across normal-day starts.
  This is the alphalens picture with two differences. Day 1 is the *entry open* after `known_at`: alphalens takes day 0 from the factor date's price, so it only avoids look-ahead if you give it the right prices. And the comparison line is Precedence's normal days, not a demeaned universe.
- **It is additive:** no label or number changes. The end point at k = h is the case's own `ret`, so the chart and the hit count always agree. Use a band from the 25th to 75th percentile, not the std: with 12 cases the std band looks more precise than it is. That is my judgment, not taken from alphalens.

### 1.5 Also seen (outside the four items; label-relevant, flag only)

- **Skipped overlapping events' windows are not removed from normal days** at HEAD `4935125` and at `619ff32`. See `evaluate`: `if i < busy_until: ... continue` runs before `windows.append`.
  Take event A entering at day 10 and event B entering at day 25, with h = 20. B is skipped as a case, and its bars 30..44 can still start normal windows that measure B's aftermath.
  `detect_insider_clusters` fires on every filing once there are 3 in 10 days, so clusters produce runs of such events. The normal rate for insider selling is probably contaminated.
  Branch `ml-ai-strict-rule` fixes this: `windows.append((i, i + h))` runs for every event ("an overlapping event isn't a new case, but its days aren't normal either"). **It would change normal_n, normal_rate and possibly labels.**
- **Not done because of the scope cut:** scipy `binomtest` / `false_discovery_control` / `permutation_test`, the Harvey-Liu-Zhu t > 3 hurdle, the deflated Sharpe ratio, pypbo, and the empyrical / quantstats VaR conventions against `bad_day_return` (`rets[int(n*0.05)]`, the lower order statistic with no interpolation). All **unverified here**.

### What Precedence should change or add (ranked)

1. **README "Research used": add Cowan (1992).** Suggested wording: "Cowan (1992), *Nonparametric event study tests*, RQFA 2:343 (the STRONG rule is the one-sided 5% generalized sign test, one stock's events in place of firms, normal days as the estimation window)". Also add López de Prado (2018) ch. 4, average uniqueness, for `normal_periods`. 5 min. Changes no number or label.
2. **Done (`909bb4a`):** `newcombe()` is pinned to statsmodels 0.15.0's values, hard-coded so there's no new dependency, including AMZN's fractional case. Test only; changes no number or label.
3. **Done (`909bb4a`):** the `periods_spanned` docstring names AFML average uniqueness and its precondition, and a test checks the equality on 300 random event patterns. Changes no number or label.
4. **Pro wording:** call the rule "a one-stock generalized sign test (Cowan 1992) at 5%, one-sided", and show the exact binomial p (already computed for BH) next to it. 15 min. The label is unchanged, but the text shows AMZN's exact p = 0.060 beside STRONG. That goes well with the "borderline" framing already chosen for the demo.
5. **After the demo, not now:** exclude skipped overlapping events' windows from normal days (§1.5). About 10 min of code, but it **changes normal rates and possibly labels**, and the fixtures need a re-export.
6. **After the demo, not now:** the average-path chart after events (alphalens-style, §1.4). About 45 min backend and frontend. Additive, so no label changes.

## 2. AI reading: screenshots and filings

Checked 2026-09-26/27 against live sources. **Verified** = I read the primary source today. **Unverified** = inferred, not tested (no Gemini key; no Gemini call was made). Precedence code read at worktree `ml-baselines` HEAD `4935125`.

Precedence's rule, "Gemini only reads; whether the reading is right is decided elsewhere (reconcile, XBRL)", is the pattern the official docs recommend. The structured-output guide says: "While output is syntactically correct JSON, always validate values in your application" ([structured-output](https://ai.google.dev/gemini-api/docs/structured-output)). Two holes make that rule weaker than it looks:

1. Google's own docs disagree on the primary request's `mimeType` spelling (section 2.1). If Precedence's spelling is wrong, every call falls back to the older format (unverified: no key).
2. For 8-Ks, Precedence reads the wrong document, and XBRL has nothing to check the numbers against (verified on a real filing).

### Baselines at a glance

| Repo | Stars (live) | License | What to borrow (path::function) | How Precedence compares |
|---|---|---|---|---|
| [googleapis/python-genai](https://github.com/googleapis/python-genai) @`6d01288` | 3,994 | Apache-2.0 | [`google/genai/models.py::_GenerateContentConfig_to_mldev`](https://github.com/googleapis/python-genai/blob/6d012889752f65c1a51d0ad6e5970fc97d19c4ca/google/genai/models.py#L1172) maps `response_json_schema` to **`responseJsonSchema`**. [`types.py::GenerateContentResponse._get_text`](https://github.com/googleapis/python-genai/blob/6d012889752f65c1a51d0ad6e5970fc97d19c4ca/google/genai/types.py#L8672) joins the text parts of `candidates[0]` and skips `part.thought`. | Precedence's `response_text` matches `_get_text` (good). The SDK's `GenerateContentConfig` has **no `response_format` field**. `ResponseFormat` says "This data type is not supported in Gemini API" ([types.py L11405](https://github.com/googleapis/python-genai/blob/6d012889752f65c1a51d0ad6e5970fc97d19c4ca/google/genai/types.py#L11405)), and only `_GenerationConfig_to_vertex` maps it, as a list ([models.py L2562-2684](https://github.com/googleapis/python-genai/blob/6d012889752f65c1a51d0ad6e5970fc97d19c4ca/google/genai/models.py#L2562)). |
| [google-gemini/cookbook](https://github.com/google-gemini/cookbook) @`f6c5d71` | 17,800 | Apache-2.0 | [`examples/Pdf_structured_outputs_on_invoices_and_forms.ipynb`](https://github.com/google-gemini/cookbook/blob/f6c5d71cd8c3b0c0f385b8ade6c68a46f8876599/examples/Pdf_structured_outputs_on_invoices_and_forms.ipynb): `generate_content(model=model_id, contents=[prompt, file], config={'response_mime_type': 'application/json', 'response_schema': model})`, then `response.parsed` | Uses the legacy fields, puts the text **before** the file, and does no arithmetic or cross-check validation. Precedence's reconcile step goes further than the cookbook. |
| [567-labs/instructor](https://github.com/567-labs/instructor) @`e12f8b4` | 13,947 | MIT | [`instructor/v2/core/retry.py::retry_sync_v2`](https://github.com/567-labs/instructor/blob/e12f8b49203b0c1f253d27c1e709d0a09b9fc5a8/instructor/v2/core/retry.py#L138) and [`instructor/v2/providers/gemini/handlers.py::reask_gemini_json`](https://github.com/567-labs/instructor/blob/e12f8b49203b0c1f253d27c1e709d0a09b9fc5a8/instructor/v2/providers/gemini/handlers.py#L71). `instructor/core/retry.py` is now a shim: `from instructor.v2.core.retry import *`. | Precedence has no reask loop (good, see below). Borrow the *attempt log* idea (`FailedAttempt`), not the reask message. |
| [google/langextract](https://github.com/google/langextract) @`62b933a` | 38,896 | Apache-2.0 | [`langextract/resolver.py::Resolver.align`](https://github.com/google/langextract/blob/62b933a2c757fd2bbb100498571b8d1692db4344/langextract/resolver.py#L337) and [`WordAligner._fuzzy_align_extraction`](https://github.com/google/langextract/blob/62b933a2c757fd2bbb100498571b8d1692db4344/langextract/resolver.py#L601): every extraction is aligned to character offsets in the source (`MATCH_EXACT` / `MATCH_FUZZY`) | Precedence asks for `text_value` "copied exactly as printed" but **never checks that it appears in the text**. A 5-line grounding check copies this idea (change #3). |
| [microsoft/markitdown](https://github.com/microsoft/markitdown) @`b8f79c5` | 187,240 | MIT | [`converters/_html_converter.py::HtmlConverter.convert`](https://github.com/microsoft/markitdown/blob/b8f79c57ebc0044be41323d89b2a45d3fda8460e/packages/markitdown/src/markitdown/converters/_html_converter.py#L42) uses `BeautifulSoup(file_stream, "html.parser")`, drops `script`/`style`, then runs [`_markdownify.py::_CustomMarkdownify`](https://github.com/microsoft/markitdown/blob/b8f79c57ebc0044be41323d89b2a45d3fda8460e/packages/markitdown/src/markitdown/converters/_markdownify.py#L25), a subclass of `markdownify.MarkdownConverter` | It keeps tables as Markdown pipe tables through markdownify's own table conversion (the subclass overrides only headings, links, images, inputs, u, strike and soup). It needs bs4 and markdownify, which Precedence doesn't have. The stdlib prototype below gets the same `\| a \| b \|` rows. |
| [dgunning/edgartools](https://github.com/dgunning/edgartools) @`b022ad2` | 2,752 | MIT | [`edgar/company_reports/current_report.py::CurrentReport.press_releases`](https://github.com/dgunning/edgartools/blob/b022ad29ac3965248c473b5790cf8e124887eac6/edgar/company_reports/current_report.py#L647) filters attachments with `document_type in ['EX-99.1', 'EX-99', 'EX-99.01']` (its comment: not EX-99.2). [`has_press_release`](https://github.com/dgunning/edgartools/blob/b022ad29ac3965248c473b5790cf8e124887eac6/edgar/company_reports/current_report.py#L488) means Item 2.02 plus a parseable EX-99.1. [`earnings`](https://github.com/dgunning/edgartools/blob/b022ad29ac3965248c473b5790cf8e124887eac6/edgar/company_reports/current_report.py#L521) is "parsed earnings data from EX-99.1". Also [`press_release.py::PressRelease.text/to_markdown`](https://github.com/dgunning/edgartools/blob/b022ad29ac3965248c473b5790cf8e124887eac6/edgar/company_reports/press_release.py#L68). | This is the baseline for "an earnings 8-K means read EX-99.1". Precedence summarizes `primary_doc`, the cover page. |
| [getomni-ai/zerox](https://github.com/getomni-ai/zerox) @`91bbb20` | 12,262 | MIT | [`node-zerox/src/models/google.ts`](https://github.com/getomni-ai/zerox/blob/91bbb20c50de86067670aa13833afa1b8a73c22e/node-zerox/src/models/google.ts#L152) sends `responseMimeType: "application/json", responseSchema: schema`. [`src/index.ts`](https://github.com/getomni-ai/zerox/blob/91bbb20c50de86067670aa13833afa1b8a73c22e/node-zerox/src/index.ts#L69) has `maxRetries = 1` | Retries on errors only. My grep of those files found no arithmetic check (partial check). Precedence's reconcile is stronger. |
| [datalab-to/marker](https://github.com/datalab-to/marker), [allenai/olmocr](https://github.com/allenai/olmocr), [docling-project/docling](https://github.com/docling-project/docling), [Unstructured-IO/unstructured](https://github.com/Unstructured-IO/unstructured) | 40,003 / 19,665 / 68,028 / 15,504 | Apache-2.0 / Apache-2.0 / MIT / Apache-2.0 | Not read today (stars and licenses checked live only) | Heavy PDF/OCR pipelines, not worth adding before the freeze. I found no high-star repo that reads brokerage holdings from screenshots; the closest are general table/receipt extractors like zerox and the cookbook. **Unverified: I did not do an exhaustive search.** |
| [patronus-ai/financebench](https://github.com/patronus-ai/financebench), [czyssrs/FinQA](https://github.com/czyssrs/FinQA), [NExTplusplus/TAT-QA](https://github.com/NExTplusplus/TAT-QA) | 362 / 393 / 138 | (none in API) / MIT / MIT | Not read today | See the evaluation note below |

### 2.1 Gemini API as of today: the exact request fields (verified)

- **Model.** `gemini-3.8-flash` exists: "September 2, 2026 Gemini 3.8 Flash generally available (GA): Released gemini-3.8-flash" ([changelog](https://ai.google.dev/gemini-api/docs/changelog)). It is the first Flash row on [models](https://ai.google.dev/gemini-api/docs/models) and the model in every structured-output example. `gemini-3.5-flash-lite` also exists. Precedence's `DEFAULT_MODEL` is fine.
- **Structured output on `generateContent`.** The [API reference, GenerationConfig](https://ai.google.dev/api/generate-content#generationconfig) lists `"responseFormat": { object (ResponseFormatConfig) }`:
  - `ResponseFormatConfig` = `{"text": {object (TextResponseFormat)}, "audio": …, "image": …}`.
  - `TextResponseFormat` = `{"mimeType": enum (MimeType), "schema": value}`.
  - **MimeType enum: `MIME_TYPE_UNSPECIFIED`, `APPLICATION_JSON`, `TEXT_PLAIN`.**
  - `responseSchema` and `_responseJsonSchema` are marked "(deprecated)… Deprecated. Use responseFormat instead." `responseMimeType` and `responseJsonSchema` are still listed.
  - The reference's own REST sample still sends `"generationConfig": {"response_mime_type": "application/json", "response_schema": {...}}`.
- **Two structured-output guides, and the reference disagrees with them.** The `generateContent` guide ([generate-content/structured-output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), updated 2026-09-02) sends `"generationConfig": {"responseFormat": {"text": {"mimeType": "application/json", "schema": {...}}}}` in its REST example, and the same `"application/json"` in its Python and JavaScript examples. `APPLICATION_JSON` appears nowhere on that page. The other guide ([structured-output](https://ai.google.dev/gemini-api/docs/structured-output), updated 2026-09-23) covers the Interactions API instead (`POST /v1beta/interactions`, top-level `"response_format": {"type": "text", "mime_type": "application/json", ...}`). An earlier draft of this note missed the first guide. For nullable fields the guides say to include "null" in the type array: `{"type": ["string", "null"]}`.
- **Thinking.** `thinkingConfig` = `{"includeThoughts", "thinkingBudget", "thinkingLevel"}`, with ThinkingLevel values `MINIMAL | LOW | MEDIUM | HIGH`; "Use with earlier models results in an error" ([reference](https://ai.google.dev/api/generate-content#ThinkingConfig)). The [thinking](https://ai.google.dev/gemini-api/docs/thinking) table says: **"gemini-3.8-flash On (medium) low, medium, high"**, so `minimal` is not allowed on 3.8 Flash. `gemini-3.5-flash-lite` defaults to minimal and allows minimal, low, medium, high. Sending `thinking_level` together with `thinking_budget` returns a 400 ([gemini-3 guide](https://ai.google.dev/gemini-api/docs/gemini-3)).
- **Temperature.** "The sampling parameters temperature, top_p and top_k are now deprecated" ([changelog](https://ai.google.dev/gemini-api/docs/changelog)). The gemini-3 guide says a temperature below 1.0 "may lead to unexpected behavior, such as looping". Precedence sends none: correct.
- **mediaResolution.** It is per-part `"mediaResolution": {"level": MEDIA_RESOLUTION_LOW|MEDIUM|HIGH|ULTRA_HIGH}`, or a `generationConfig.mediaResolution` enum ([reference, Part](https://ai.google.dev/api/generate-content)). The [media-resolution](https://ai.google.dev/gemini-api/docs/media-resolution) page recommends **Images: `high`, 1120 tokens**, and the unspecified default for images is also 1120. PDFs saturate at `medium`. Precedence needs no change here.
- **Part order.** "When using a single image with text, **place the text prompt before the image** in the input array" ([image-understanding](https://ai.google.dev/gemini-api/docs/image-understanding)). `read_screenshot` puts the image first (gemini.py L237-238). The inline request limit is 20 MB, so Precedence's 15 MB cap is fine.

**What this means for gemini.py (unverified: no key).** The field names in `generation_config()` match the reference and the `generateContent` guide. The one open question is the `mimeType` spelling. The reference lists an enum (`APPLICATION_JSON`), while every worked example sends `"application/json"`, which is what Precedence sends. Settling it needs a live call. Either way the 400 fallback to `responseMimeType` + `responseSchema` still returns a read, but it drops `thinkingConfig`, so a fallback read runs at 3.8 Flash's default `medium` thinking and costs two requests. **Decision: keep `"application/json"`.** After the freeze, log which format was accepted, have `scripts/check_gemini.py` print it, and run it once with `data/cache/gemini/` cleared, because the cache hides the call. A switch to `"APPLICATION_JSON"` was prepared and then withdrawn (commit `470996a`, never merged).

### 2.2 Which document an 8-K summary reads, and what html_to_text does to tables (verified on a real 8-K)

`filing_summary` → `filing_text(cik, accession, f["primary_doc"], ...)` → `SecClient.document(...)` fetches **`primary_doc` only** (main.py L419-429, sec.py L226-229). The real example is Blackstone's 8-K [0001193125-26-313250](https://www.sec.gov/Archives/edgar/data/1393818/000119312526313250/0001193125-26-313250-index.htm), filed 2026-07-23, Items 2.02 and 9.01 (Q2 results). I made 6 SEC requests at 2 per second or slower, with UA `Precedence research <contact email>`.

| Document | Bytes | Precedence `html_to_text` chars | Dollar figures |
|---|---|---|---|
| `d153439d8k.htm` (primary, the one Precedence reads) | 24,420 | **2,891** | **0** (cover page, addresses, checkboxes) |
| `d153439dex991.htm` (EX-99.1 press release) | 2,652,305 | 103,774 (fits in the 150k cut) | All of them, e.g. "GAAP Net Income was $2.4 billion for the quarter and $3.6 billion year-to-date" and the GAAP income statement table |
| `d153439d8k_htm.xml` (the 8-K's XBRL instance) | 3,455 | n/a | **0 us-gaap facts, 22 dei facts** |

So for an earnings 8-K:
- Gemini gets no figures. Any figure it lists would be invented.
- `check_figures` queries `xbrl_facts where accession = %s` (main.py) and finds nothing, so every figure comes back `match: None`.

The XBRL for that quarter arrives later in the 10-Q. `sec.py`'s comment cites BX 10-Q 0001193125-26-340208 (filed 2026-08-07); I did not fetch it. edgartools makes the same call as I recommend: Item 2.02 plus EX-99.1 is the press release (`CurrentReport.has_press_release`, `press_releases`).

**How the tables break.** `_Text.handle_data` appends every text node and `html_to_text` joins them with spaces, so table structure disappears. From the real EX-99.1:

```
old: ($ in thousands, except per share data) (unaudited) 2Q’25 2Q’26 2Q’25 YTD 2Q’26 YTD 2Q’25 LTM 2Q’26 LTM Revenues Management
     and Advisory Fees, Net $ 2,035,495 $ 2,266,006 … Other (225,063 ) 11,947 (298,673 ) … Total Revenues $ 3,711,900 $ 5,043,978
     $ 7,001,358 $ 8,661,573 $ 13,747,117 $ 16,110,480 Expenses …
```

Six unlabeled numbers per line item. The model has to count positions back to a header about 500 characters earlier to know that the second number is 2Q'26 (not YTD or LTM), which is exactly the `period_end` Precedence's XBRL check needs. The "in thousands" scale note is far away too, and negatives come out split as `(225,063 )`.

**Smallest stdlib-only fix (prototype, tested).** The prototype is in Appendix A, about 40 lines of `html.parser`:
- On `<tr>`, collect the `<td>`/`<th>` texts.
- Drop the empty spacer cells EDGAR uses.
- Merge the `$`, `(`, `)` and `%` cells into their neighbours.
- Emit `| a | b |` on its own line.
- Emit newlines for block tags.
- Collapse whitespace within a line only.

On the same EX-99.1 it produces 760 table rows. The output is 112,888 chars, 8.8% more and still under 150k:

```
| ($ in thousands, except per share data) (unaudited) | 2Q’25 | 2Q’26 | 2Q’25 YTD | 2Q’26 YTD | 2Q’25 LTM | 2Q’26 LTM |
| Other | (225,063) | 11,947 | (298,673) | 62,920 | (239,431) | 90,720 |
| Total Revenues | $3,711,900 | $5,043,978 | $7,001,358 | $8,661,573 | $13,747,117 | $16,110,480 |
```

It passes both existing `test_html_to_text_drops_markup_scripts_and_styles` assertions unchanged. Nested tables and `colspan` headers are not handled; this is a prototype, not Precedence code.

### 2.3 A screenshot read that doesn't add up: why not reask, and what to do instead

**What instructor does (verified).**
- Loop: `retry_sync_v2` builds `stop_after_attempt(max(max_retries, 0) + 1)` ([L192](https://github.com/567-labs/instructor/blob/e12f8b49203b0c1f253d27c1e709d0a09b9fc5a8/instructor/v2/core/retry.py#L192)). `max_retries` means "retries after the initial attempt", and the default in `retry_sync` is `1` ([L380](https://github.com/567-labs/instructor/blob/e12f8b49203b0c1f253d27c1e709d0a09b9fc5a8/instructor/v2/core/retry.py#L380)), so two calls in total.
- On a parse or validation error it records a `FailedAttempt` and calls the provider's `handle_reask`. When attempts run out it raises `InstructorRetryException`.
- Message: for Gemini JSON, `reask_gemini_json` appends a user turn: *"Correct the following JSON response, based on the errors given below: JSON: {previous answer} Exceptions: {error}"* ([handlers.py L71-86](https://github.com/567-labs/instructor/blob/e12f8b49203b0c1f253d27c1e709d0a09b9fc5a8/instructor/v2/providers/gemini/handlers.py#L71)).

**Why that is unsafe for reconcile.** Precedence's `NEEDS_REVIEW` message states the target: "The rows add up to $X but the screen says $Y (off by $D)". Fed back as the "Exceptions", it tells the model which number to hit. The cheapest way for the model to pass is to change a share count or value until the sum lands on the total. The check then turns circular: passing it after being told the answer is no longer independent evidence that the rows were read correctly. That breaks "the model is never trusted on its own". (This is my reasoning from how the loop works; I found no paper measuring it for this task.)

**Safer design: an independent second read, then agreement plus reconcile.**
1. Only when `reconcile` returns `needs_review`, make one more *fresh* request. Use the same image, give it no feedback and no total, and cache it under a different key (e.g. `…_read2`). Optionally use a variant prompt, such as "read the value column top to bottom", so the two reads' errors are less correlated.
2. Compare the reads cell by cell. Accept a cell only if both reads agree on it and the merged rows reconcile to the printed total. Otherwise show both readings with the disagreeing cells highlighted, and let the person choose or type.
3. This is self-consistency: sample independent answers and take the agreed one, not a revised one (Wang et al. 2022, *Self-Consistency Improves Chain of Thought Reasoning in Language Models*, [arXiv:2203.11171](https://arxiv.org/abs/2203.11171); cited from memory, not re-read today).
4. Keep instructor's useful part: record each attempt (`FailedAttempt`-style) so the UI can show "read twice, agreed on 7 of 8 rows".

The same logic applies to filings. Never feed the XBRL value back to the model; `check_figures` should stay the judge.

### 2.4 Evaluation baselines (quick check only)

These were not read today; the descriptions are from their papers and repos.
- FinanceBench ([repo](https://github.com/patronus-ai/financebench); Islam et al. 2023, [arXiv:2311.11944](https://arxiv.org/abs/2311.11944)): an open sample of questions over real 10-K/10-Q/8-K filings, with evidence text and answers.
- FinQA ([repo](https://github.com/czyssrs/FinQA)) and TAT-QA ([repo](https://github.com/NExTplusplus/TAT-QA)): numeric QA over table-plus-text excerpts from reports.

None of the three checks Precedence's actual contract ("every stated figure matches XBRL at the printed precision"). For the demo, a better quick check is the real case above. BX 8-K Q2 2026 should state `Total Revenues` 2Q'26 = $5,043,978 thousand. Once the 10-Q for the period ending 2026-06-30 is ingested, its XBRL should hold `us-gaap:Revenues` = 5,043,978,000 (**unverified**; I did not fetch the 10-Q).

### What Precedence should change (ranked)

| # | Change | Effort | Risk | Why |
|---|---|---|---|---|
| 1 | Keep `"mimeType": "application/json"`, as in Google's worked examples. Log which request format was accepted, have `check_gemini.py` print it, and run it once with an empty cache. If the fallback fires, try the reference's `"APPLICATION_JSON"` or the SDK's `responseMimeType` + `responseJsonSchema` next. | 10 min | Low (the fallback stays) | Settles on the first live call whether a read costs one request or two, and whether `thinkingLevel: low` applies. |
| 2 | Put `{"text": PROMPT}` before `inline_data` in `read_screenshot`. | 1 min | Very low (the cache key is the image hash, so cached reads are unaffected) | The image-understanding page says text goes before the image. |
| 3 | Grounding check in `check_figures`: a figure whose `text_value` (whitespace-normalized) is not in the text sent to Gemini is shown as "not found in the filing", never as a match. | 10 min | Low | This is LangExtract's source-alignment idea. It catches invented figures, which a cover-page 8-K invites. |
| 4 | Earnings 8-Ks: when the form is 8-K, fetch `{accession}-index.htm`, pick the row whose Type is `EX-99.1` (the edgartools rule), and summarize that instead of `primary_doc`. Check its figures against XBRL facts for the same ticker and `period_end` from the company's 10-Q/10-K, not the 8-K's accession. | 20–30 min | Medium (one extra cached SEC request; 8-Ks without an EX-99.1 keep the cover) | The cover doc has 0 figures and the 8-K's XBRL has 0 us-gaap facts (BX example above). |
| 5 | Replace `_Text`/`html_to_text` with the table-keeping version (Appendix A) and add one test with a `<tr>` fixture. | 15 min | Low-medium (+9% chars; cached summaries stay as they are until the cache is cleared) | Keeps period headers and scale next to the values, which is what `period_end` and full-unit `value` depend on. |
| 6 | On `needs_review`, one independent second read (no reask, no total in the prompt), merged by agreement and then reconciled. | 25–40 min | Medium: UI work too. **After the freeze.** | Self-consistency, and it never shows the model the answer. |

## 3. Insider selling and the other signals

Written 2026-09-27 ~07:58 ET under the freeze deadline. Anything marked **(unverified)** was not confirmed against a primary source.

**The main finding.** Every AMZN sale filing in the live cluster is a pre-planned Rule 10b5-1 sale: 7 of 7 filings have the box checked. Across the whole sample it is 20 of 22 sale filings since 2023-04-01, and 22 of 22 if you count footnotes. The research says routine, pre-scheduled selling carries almost no information. So AMZN's WATCH rests on the kind of insider selling that is least likely to mean anything.

### 3.1 The Rule 10b5-1 checkbox in the Form 4 XML

- **Element:** `<aff10b5One>`. It is a direct child of `<ownershipDocument>` (document-level, not per transaction). It sits after the last `<reportingOwner>` and before `<nonDerivativeTable>`.
- **Values:** `1` = checked, `0` = not checked. edgartools also accepts `true`/`false` and treats anything else as unknown (`None`).
- **Where it came from:** the SEC's Dec 14, 2022 amendments. The press release says: "Insiders that report on Forms 4 or 5 will be required to indicate by checkbox that a reported transaction was intended to satisfy the affirmative defense conditions of Rule 10b5-1(c) and to disclose the date of adoption of the trading plan." (https://www.sec.gov/news/press-release/2022-222)
- **EDGAR release (unverified):** a search summary of the SEC tech-spec pages says `aff10b5One` was added to Forms 4, 4/A, 5 and 5/A in EDGAR Release 23.1 on 2023-03-20. I did not confirm this in the spec PDF; the spec landing page is https://www.sec.gov/info/edgar/ownershipxmltechspec.htm.
- **A real filing:** AMZN, Jassy, accession 0001374545-26-000010, filed 2026-08-25 (https://www.sec.gov/Archives/edgar/data/1018724/000137454526000010/). Its `schemaVersion` is `X0609`; Precedence's fixture uses `X0508` and has no `aff10b5One`. The element order is:
  `schemaVersion, documentType, periodOfReport, notSubjectToSection16, issuer, reportingOwner, aff10b5One(=1), nonDerivativeTable, …`
- **Plan adoption date:** AMZN filers give it in a footnote, e.g. "This transaction was effected pursuant to a Rule 10b5-1 trading plan adopted by the reporting person on 11/14/2025." I did not check whether the spec has a structured date element **(unverified)**.
- **Older filings:** the only signal is that footnote. Some 2023 filings leave the box at `0` while the footnote still cites a plan adopted before the amendments:
  - 0001018724-23-000036 (Jassy, 2023-11-24): plan adopted 11/08/2022
  - 0001104659-23-042198 (Herrington, 2023-04-05): plan adopted 11/23/2022

  For those, the rule should be: trust the checkbox, and fall back to the footnotes when the checkbox is missing or `0`.

### 3.2 AMZN: how much of the WATCH cluster is planned selling

**Local data.** There was nothing to count locally:
- The local `stone` database has 0 rows in `insider_trades` and 0 Form 4 filings. The full database isn't on this Mac; the demo's numbers come from the committed fixtures.
- `insider_trades` has no column for the 10b5-1 flag, footnotes, owner CIK or shares held after the trade.
- No `data/cache/sec` directory exists under the worktree or the main checkout.

**Sample.** So I sampled EDGAR directly with 29 polite requests (~2 req/s, User-Agent `Precedence research <contact email>`). The sampling script and the raw XML stayed outside the repo.
- AMZN has **289 Form 4s filed since 2023-04-01**, all original 4s with no 4/A (https://data.sec.gov/submissions/CIK0001018724.json).
- The sample is 28 filings: the 10 most recent in a row, plus 18 spread evenly over the rest.

| | Box checked (`aff10b5One=1`) | Footnote cites 10b5-1 plan |
|---|---|---|
| Sampled sale filings (code S, disposed), 2023-04 → 2026-09 | **20 / 22** (90% Wilson 0.76–0.97) | **22 / 22** (0.89–1.00) |
| Sale filings from 2024 on | **18 / 18** | 18 / 18 |
| Dollar value of sales in sample | **$991.7M of $995.3M (99.6%)** | — |
| **Live cluster** (window 2026-08-24 → 09-03: six sale filings on 08-25 from Reynolds, Olsavsky, Zapolsky, Herrington, Garman and Jassy, plus Herrington on 09-03) | **7 / 7** | 7 / 7 |

**Why the cluster fires.** This is inferred from EDGAR plus `engine.py`, not read from Precedence's database. The 09-03 filing makes 7 filings in 10 days. Its 20-day window is still open (entry 09-04), so `evaluate()` marks it as firing.

**If planned sales were excluded:** zero filings would qualify, and the insider signal would not fire for AMZN.

**Timing pattern.** The sampled sales land on the same dates every quarter: around Feb 24–25, May 17–26, Aug 23–25 and Nov 24–25. That is a vest-and-sell calendar, which is exactly what Cohen, Malloy and Pomorski call "routine".

### 3.3 Repos

Stars, licenses and push dates were checked live on 2026-09-27 with `gh api repos/…`.

| Repo | Stars | License | What to borrow (path::function) | How Precedence compares |
|---|---|---|---|---|
| [dgunning/edgartools](https://github.com/dgunning/edgartools) | 2,752 | MIT | `edgar/ownership/forms.py::_parse_aff10b5_one` and `Ownership.parse_xml` (reads `aff10b5One` at document level), plus class `Form4`. `edgar/ownership/core.py::detect_10b5_1_plan` with `_RULE_10B5_1_PATTERN` (a footnote regex that doesn't confuse Rule 10b-5 with 10b5-1). `edgar/ownership/summary.py::TransactionSummary.has_10b5_1_plan` (the checkbox wins, footnotes are the fallback), plus `net_change` / `net_value`. Test: `tests/issues/regression/test_issue_863_10b5_plan_detection.py`. | Precedence's `sec.py::parse_form4` reads only the code, shares, price and A/D. It ignores `aff10b5One`, footnotes, `sharesOwnedFollowingTransaction` and owner CIK. Copy the 10-line checkbox parser and the regex. |
| [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB) | 73,505 | NOASSERTION per the API **(check the LICENSE file)** | `openbb_platform/core/openbb_core/provider/standard_models/insider_trading.py`. Fields: `owner_cik`, `owner_title`, `ownership_type`, `transaction_type`, `acquisition_or_disposition`, `securities_owned`, `securities_transacted`, `transaction_price`, `filing_url`. The standard model has no 10b5-1 field. | Borrow the idea of `owner_cik`, so Precedence can count distinct insiders, and `securities_owned`, so it can compute the % of holdings sold. |
| [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) | 63,768 | MIT | The repo has been restructured: `src/agents/sentiment.py` returns 404. Insider data now flows through `hedge_fund/data/client.py`. I did not locate the agent's signal logic in time **(unverified)**. | — |
| [jadchaar/sec-edgar-downloader](https://github.com/jadchaar/sec-edgar-downloader) | 716 | MIT | Downloads filings only; it does no Form 4 parsing (source not re-read). | Precedence's `fetch.py::CachedFetcher` already covers this. Nothing to borrow. |

### 3.4 Which insider sales carry information

**Cohen, Malloy & Pomorski, "Decoding Inside Information"** (J. Finance 2012; NBER w16454, https://www.nber.org/papers/w16454, text from https://www.nber.org/system/files/working_papers/w16454/w16454.pdf):
- **Who can be classified:** "We require an insider to make at least one trade in each of the three preceding years in order to define her as either an opportunistic or a routine trader."
- **Routine:** "we define a routine trader as an insider who placed a trade in the same calendar month for at least three consecutive years."
- **Opportunistic:** everyone else who qualifies.
- **When:** each insider is classified at the start of every calendar year, and that label applies to their trades from then on.
- **Results for opportunistic trades:** buys minus sells earns 82 bp/month value-weighted (t=2.15) and 180 bp/month equal-weighted.
- **Results for routine trades:** buys minus sells earns −20 bp/month value-weighted (t=−0.57).
- **On sales:** "over half of the improvement … comes from the superior performance of opportunistic sells relative to routine sells". The same paper notes that the earlier literature (it cites Jeng, Metrick & Zeckhauser 2003) "generally finds weak evidence on the profitability of insider sales".

**Jagolinzer (2009), Management Science 55(2):224–239** (https://pubsonline.informs.org/doi/10.1287/mnsc.1080.0928): before the 2023 amendments, sales under 10b5-1 plans "systematically follow positive and precede negative firm performance". So a plan alone was not proof that a sale was uninformative. The SEC's 2022 amendments added cooling-off periods and the checkbox in response. Gensler said "insiders have sought to benefit from the rule's liability protections while trading securities opportunistically" (https://www.sec.gov/news/press-release/2022-222).

Not checked **(unverified)**:
- The cooling-off lengths I remember: for directors and officers, the later of 90 days or 2 business days after the 10-Q/10-K, capped at 120 days; 30 days for others. Release 33-11138: https://www.sec.gov/files/rules/final/2022/33-11138.pdf.
- Lakonishok & Lee (2001).
- Jeng, Metrick & Zeckhauser (2003), beyond the line CMP quotes from them.

**What this means for "3+ sale filings in 10 days":**
1. **Separate planned (10b5-1) from unplanned sales.** At minimum, show the split. After the 2023 amendments (a 90-day-plus cooling-off, and adoption dates disclosed), a checked box is a reasonable proxy for "scheduled in advance".
2. **Drop routine sellers.** Use the CMP definition: the same calendar month in 3 consecutive prior years.
3. **Count distinct insiders, not accessions.** Herrington alone filed twice inside the live window.
4. **Weight each sale by dollar size or by % of holdings sold,** using `sharesOwnedFollowingTransaction`.

### 3.5 Gap-down and rate-jump signals

Not researched before the freeze. I have no primary evidence either way on whether 5%+ overnight gaps continue or reverse, or on how sensitive stocks are to 10-year yield jumps.

### What Precedence should change (ranked)

| # | Change | Effort | Changes demo labels? |
|---|---|---|---|
| 1 | In `parse_form4`, read `aff10b5One`: `_text(root, "aff10b5One") in ("1", "true")`. Add the edgartools footnote-regex fallback. Store it as a new `insider_trades.plan_10b5_1 boolean` column (`alter table … add column if not exists`). Re-ingest from cache. Add a fixture with `<aff10b5One>1</aff10b5One>`. | 25–35 min | **No**, by itself |
| 2 | Pro text on the insider card: "7 of 7 filings in this cluster were pre-planned Rule 10b5-1 sales". This is display-only; the label stays as it is. It fits the frozen STRONG rule the way the "stricter test" evidence does. | 10–15 min after #1 | **No** |
| 3 | Count distinct insiders (store `rptOwnerCik`) instead of accessions. | 15–20 min | Possibly elsewhere. For AMZN, the live window has 6 distinct insiders, so it still fires |
| 4 | Leave 10b5-1 sales out of the cluster (only unplanned sales count). | 10 min after #1 | **Yes.** AMZN's live cluster drops to 0 qualifying filings, so the insider signal no longer fires. Its history also shrinks, probably below 10 cases (WEAK). **Do after the demo, or behind the user's STRONG-rule decision** |
| 5 | CMP routine filter (same month, 3 consecutive prior years) and dollar or %-of-holdings weighting. | 45–60 min | **Yes**, post-freeze |

## Appendix A: table-keeping `html_to_text` (research prototype, not Precedence code)

Stdlib only. On BX's Q2 2026 EX-99.1 it keeps 760 table rows under their period headers, for 8.8% more characters. It passes the existing `test_html_to_text_drops_markup_scripts_and_styles` assertions. It does not handle nested tables or `colspan` headers.

```python
"""Stdlib-only html_to_text that keeps table rows as '| a | b |' lines (research prototype, not Precedence code)."""
import html, re
from html.parser import HTMLParser

BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr"}

class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self._skip, self.row, self.cell = [], 0, None, None
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"): self._skip += 1
        elif tag == "tr": self.row = []
        elif tag in ("td", "th") and self.row is not None: self.cell = []
        elif tag in BLOCK and self.cell is None: self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in ("script", "style", "head") and self._skip: self._skip -= 1
        elif tag in ("td", "th") and self.cell is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip()); self.cell = None
        elif tag == "tr" and self.row is not None:
            cells = merge([c for c in self.row if c])       # SEC tables pad with empty spacer cells
            if cells: self.parts.append("\n| " + " | ".join(cells) + " |\n")
            self.row = None
        elif tag in BLOCK and self.cell is None: self.parts.append("\n")
    def handle_data(self, data):
        if self._skip: return
        (self.cell if self.cell is not None else self.parts).append(data)

def merge(cells):
    """'$' | '1,234' -> '$1,234'; '(5' | ')' -> '(5)'; '12' | '%' -> '12%' (EDGAR splits these into cells)."""
    out = []
    for c in cells:
        if out and (c in (")", "%", ")%") or out[-1] in ("$", "(", "$(")): out[-1] += c
        else: out.append(c)
    return out

def html_to_text(raw: bytes, limit: int = 150_000) -> str:
    p = _Text(); p.feed(raw.decode("utf-8", errors="replace"))
    text = html.unescape("".join(p.parts))
    text = "\n".join(re.sub(r"[ \t\xa0]+", " ", ln).strip() for ln in text.splitlines())
    text = re.sub(r"\n{2,}", "\n", text).strip()
    return text[:limit]
```
