# Precedence: judge scorecard #7

**Judge:** strict Blackstone VP · **Build:** :3000 production build of `1b008db` (API same commit) · **Time:** Sep 27, 05:40 ET · **Evidence:** QA/WALK.md
**Trend:** #1 3/5 (2 blockers) → #2–#4 4 → #5–#6 4 (5 with wording) → **#7 4/5 as shipped, 5/5 with the wording switch** (0 blockers, 0 open minors).

## Scores (1–5)

| Category | #6 | **#7** | Note |
|---|---|---|---|
| Brief fit | 5 | **5** | Today's evidence is now linked to its Form 4 on sec.gov. |
| Portfolio + funds | 5 | **5** | SPY, VOO, IVV and QQQ each use their own holdings file. |
| Classic (Lite) clarity | 5 | **5** | "sold 1,000 shares on Sep 1 (reported Sep 3)". |
| Pro depth | 5 | **5** | |
| Professional design | 5 | **5** | |
| **Data honesty, as shipped** | 4 | **4** | Lite "This has mattered for AMZN before." over a 50% hit rate. The qualifier lives only in Pro. |
| *Data honesty, with `LITE_STRONG_WORDING = not-proven`* | *5* | *5* | |
| Demo-readiness | 5 | **5** | Production build, empty console, stable API for four walks. |
| Originality | 5 | **5** | |

**Overall, as shipped: 4 / 5.** **Overall, with the switch: 5 / 5.** Blockers: 0. Open minors: 0.

This is now a single-decision scorecard. Nothing else on the site costs a point. The case for the switch is unchanged: Lite is what a judge reads first, and "has mattered" over "6 of the last 12 times" is the one line where the product claims more than its own test found. Flipping `LITE_STRONG_WORDING` to `not-proven` keeps the badge, the rule and the counts.

## Remaining fixes

| # | Fix | Points |
|---|---|---|
| 1 | Owner's call: `LITE_STRONG_WORDING = not-proven`. | Honesty 4 → 5, **overall 4 → 5** |
| 2 | (Optional) Measure the IEX vs consolidated close gap once and state it. | Answers a likely judge question; no score change |

## Questions a judge may still ask
1. "Lite says it 'has mattered'; Pro says it doesn't survive the correction. Which is true?" (Only the switch removes this question.)
2. "How far is your IEX close from the statement close?"
3. "Who pays for this, and why wouldn't a broker just add it?"
