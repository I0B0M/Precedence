# Precedence: final judge scorecard (#9)

**Judge:** strict Blackstone VP · **Build:** :3000 production build of `1b008db` (API same commit) · **Time:** Sep 27, 07:12 ET · **Evidence:** QA/WALK.md · **Loop ends:** 07:30 ET (no further walk fits).

## Final scores (1–5)

| Category | #1 (00:35) | **Final** | Why |
|---|---|---|---|
| Brief fit | 4 | **5** | Understands everything you own (stocks, ETFs, a 401(k), a home, Blackstone's BREIT and BCRED) across SEC, Fed, price and fund-holdings files. Plain words in Lite. Today's evidence ("Latest sale: … sold 1,000 shares on Sep 1 (reported Sep 3). sec.gov ›") and every past case. A returning user lands on their own portfolio and week. |
| Portfolio + funds | 3 | **5** | One correct total ($1,396,740) with look-through into SPY, VOO, IVV and QQQ from their own filings, a Private-funds slice, an Investments view, and BREIT/BCRED total return that checks out by hand against the filings. |
| Classic (Lite) clarity | 4 | **5** | Zero jargon on 17 pages. Counts match rows. Liquidity said plainly ("You can't always sell: withdrawals are limited each month."). |
| Pro depth | 4 | **5** | Answer → evidence → sources → raw everywhere: case tables, split-half hold-out, BH correction, legal names + CIK, the IEX caveat, month-by-month NAV and distributions, each linked to its filing. |
| Professional design | 3 | **5** | One palette. Every tap target 44px+. Colours with single meanings. Nothing clipped or overflowing at 390 or 1280. |
| **Data honesty, as shipped** | 3 | **4** | The disclosure is the best I've seen at a hackathon. One line claims more than the test found: Lite "This has mattered for AMZN before." above "6 of the last 12 times, AMZN was lower a month later", while Pro says "Doesn't survive the correction". |
| *Data honesty, with `LITE_STRONG_WORDING = "not-proven"`* | | *5* | *Same badge, same rule, same counts. The sentence stops claiming what the correction withdraws.* |
| Demo-readiness | 3 | **5** | Production build, an empty console, zero failed requests and a stable API for six walks. |
| Originality | 4 | **5** | Per-stock "has this happened before, against its own usual rate", with honest nulls, and Blackstone private funds priced from their own SEC filings. Not Robinhood, Perplexity Finance or Fiscal.ai. |

## Final verdict
- **As shipped: 4 / 5.** Seven of eight categories at 5. **0 blockers, 0 open minors.**
- **With `LITE_STRONG_WORDING = "not-proven"` (one line in `frontend/src/lib/flags.ts:9`, then rebuild :3000): 5 / 5.**

**For the owner's 07:30 decision.** At the table, Lite is the default. The first thing a judge reads on the AMZN page is a big "50%", then "6 of the last 12 times, AMZN was lower a month later", then "This has mattered for AMZN before." The obvious question is how a coin flip has "mattered". The true answer, "it doesn't survive the correction", is one tap away in Pro, which means the presenter has to walk back the product's own sentence. The alternative wording keeps everything you decided (the Heads up badge, the STRONG rule, the counts) and changes only that sentence. The landing page already speaks this way: "Has come before drops. Not a prediction."

## Fixes ranked by points gained
| # | Fix | Points |
|---|---|---|
| 1 | `LITE_STRONG_WORDING = "not-proven"` and rebuild :3000. | Honesty 4 → 5, **overall 4 → 5** |
| 2 | (Optional) Measure the IEX vs consolidated close gap once and state the number instead of "hasn't measured by how much". | No score change; answers a likely question |

Nothing else on the site costs a point.

## Questions a judge may still ask
1. "Lite says insider selling 'has mattered for AMZN before'. Pro says it doesn't survive the correction. Which is true?" (Gone if fix #1 ships.)
2. "How far is your IEX close from my statement's close?"
3. "The N-PORT holdings are from June 30. How stale is too stale?" (Disclosed on the page.)
4. "Home value: +232% since 2012 from a ZIP index. What's the error band?"
5. "Who pays for this, and why wouldn't a broker just add it?"
