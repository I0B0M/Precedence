# Precedence: judge scorecard #6

**Judge:** strict Blackstone VP · **Build:** :3000 production build of `a6c4f41` (API same commit) · **Time:** Sep 27, 04:50 ET · **Evidence:** QA/WALK.md
**Trend:** #1 3/5 (2 blockers) → #2 4 → #3 4 → #4 4 → #5 4 (5 with wording) → **#6 4/5 as shipped, 5/5 with the wording switch** (0 blockers).

## Scores (1–5)

| Category | #5 | **#6** | Why, in one line |
|---|---|---|---|
| Brief fit | 5 | **5** | What you own, public and private, across sources, in plain words. Today's evidence is in words a person reads ("…sold 1,000 shares on Sep 1."). A returning user lands on their own week. |
| Portfolio + funds | 5 | **5** | One correct total across stocks, ETFs, 401(k), home and Blackstone funds, with look-through, Private-funds slice, Investments view, and verified total return. |
| Classic (Lite) clarity | 5 | **5** | Zero jargon, counts match rows, people's names in plain order. (Nit: Sep 1 vs Sep 3 for the same sale.) |
| Pro depth | 5 | **5** | Answer → evidence → sources → raw on every page type. |
| Professional design | 5 | **5** | Consistent across 17 pages × 4 configs: nothing clipped, nothing under 44px, nothing overflowing. |
| **Data honesty, as shipped** | 4 | **4** | Unchanged. Lite says "This has mattered for AMZN before." over a 50% hit rate; the qualifier ("Doesn't survive the correction") lives only in Pro. |
| *Data honesty, with `LITE_STRONG_WORDING = not-proven`* | *5* | *5* | *The same page, with nothing claimed that the evidence withdraws.* |
| Demo-readiness | 5 | **5** | A production build and a completely empty console now. Zero failed requests, and the API stable for three walks. |
| Originality | 5 | **5** | Per-stock base-rate checks with honest nulls, and Blackstone private funds priced from their own SEC filings. |

**Overall, as shipped: 4 / 5.** Seven of eight categories at 5, data honesty at 4, **0 blockers**.
**Overall, with the wording switch set to `not-proven`: 5 / 5.**

The reasoning for the owner is unchanged from walk #5. At the table, Lite is the default. A judge reads "50%", then "6 of the last 12 times, AMZN was lower a month later", then "This has mattered for AMZN before", and asks how a coin flip has "mattered". The alternative keeps the badge, the rule and the count. It only changes the sentence, and it's now a single switch (`6ef1c11`).

---

## Remaining fixes, ranked by points gained

| # | Fix | Where | Points |
|---|---|---|---|
| 1 | **Owner's call:** set `LITE_STRONG_WORDING` to `not-proven`. | every Lite STRONG sentence | Honesty 4 → 5, **overall 4 → 5** |
| 2 | One date for one sale: "sold 1,000 shares on Sep 1 (reported Sep 3)". | Lite company "What's going on" | Polish |
| 3 | The sec.gov link on "Latest sale", when the API sends it. | Lite company | Polish |
| 4 | Measure the IEX vs consolidated close gap once and state the number. | Stock page Pro caveat | Polish |
| 5 | VOO / IVV from their own N-PORT. | /fund/VOO, /fund/IVV | Polish |

Only #1 changes the overall score.

---

## Questions a judge will ask that we can't answer yet
1. "Lite says insider selling 'has mattered for AMZN before', over a 50% hit rate. Pro says it doesn't survive the correction. Which is true?"
2. "The sale says Sep 1, and the list says Sep 3. Which is it?" (Answer: the trade date and the filing date. Say both on the page.)
3. "How far is your IEX close from the consolidated close on my statement?"
4. "Why do VOO and IVV show SPY's holdings?"
5. "Who pays for this, and why wouldn't a broker just add it?"
