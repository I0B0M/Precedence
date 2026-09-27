# Precedence: judge scorecard #5

**Judge:** strict Blackstone VP · **Build:** :3000 production build of `c5c2cc3` (API same commit) · **Time:** Sep 27, 04:05 ET · **Evidence:** QA/WALK.md
**Trend:** #1 3/5 (2 blockers) → #2 4 → #3 4 → #4 4 → **#5 4/5 as shipped, 5/5 with the wording change** (0 blockers).

## Scores (1–5)

| Category | #3 | #4 | **#5** | Why, in one line |
|---|---|---|---|---|
| Brief fit | 4 | 4 | **5** | What you own, public and private, across SEC, Fed, prices and fund files. Plain words in Lite. Today's evidence ("Latest sale: …") plus the history. A returning user lands on their own portfolio and week. |
| Portfolio + funds | 4 | 5 | **5** | One correct total across stocks, ETFs, 401(k), home and Blackstone funds, with look-through, a Private-funds slice, an Investments view, and total return verified against filings. |
| Classic (Lite) clarity | 4 | 5 | **5** | Zero jargon, counts match rows, liquidity said plainly. (Nit: "Herrington Douglas J" in SEC name order.) |
| Pro depth | 5 | 5 | **5** | Answer → evidence → sources → raw on every page type, down to each distribution's filing. |
| Professional design | 4 | 5 | **5** | Consistent palette, 44px everywhere, nothing clipped or overflowing on 17 pages × 4 configs. |
| **Data honesty, as shipped** | 4 | 4 | **4** | The disclosure is best in class and the numbers check out by hand. But a Lite reader is told "This has mattered for AMZN before" above a 50% hit rate, and the qualifier ("Doesn't survive the correction") only exists in Pro. A disclosed choice, still one tap too far from the claim. |
| *Data honesty, with "has come before drops here. Not proven."* | | | *5* | *The same page with nothing claimed that the evidence withdraws.* |
| Demo-readiness | 4 | 4 | **5** | A production build, zero errors and zero failed requests for two walks, the returning home fixed. (The CSS preload warning is the only DevTools line.) |
| Originality | 4 | 5 | **5** | Per-stock base-rate checks with honest nulls, and Blackstone private funds priced from their own SEC filings. Not Robinhood, Perplexity Finance or Fiscal.ai. |

**Overall, as shipped: 4 / 5.** Seven categories are at 5, and data honesty is at 4 because of the Lite wording. Blockers: **0**.
**Overall, with the wording change: 5 / 5.** Every category at 5, zero blockers.

**Why I don't score the shipped wording a 5, for the owner.** Judges at a table use the default mode, which is Lite. On Lite AMZN they read a large "50%", then "6 of the last 12 times, AMZN was lower a month later", then "This has mattered for AMZN before." A Blackstone VP will ask: "Half the time it went down. How has that 'mattered'?" The honest answer is on the Pro page ("Doesn't survive the correction"), but at that moment the product has made a claim and the presenter is retracting it. The alternative line, "This has come before drops here. Not proven.", keeps the Heads up badge, the rule and the count exactly as they are. It only stops the sentence from claiming more than the test found. The landing page already uses that phrasing: "Has come before drops. Not a prediction."

---

## Remaining fixes, ranked by points gained

| # | Fix | Where | Points |
|---|---|---|---|
| 1 | **The wording (owner's call at 07:30):** "This has mattered for X before." → "This has come before drops here. Not proven." · "2 have mattered before" → "2 have come before drops" · hero "whether that kind of news has ever mattered for that stock" → "whether that kind of news has come before a drop". | Lite rows, company pages, /funds, Your week, THIS WEEK, home hero | Honesty 4 → 5, **overall 4 → 5** |
| 2 | **Latest sale, finished:** "Douglas Herrington, CEO Worldwide Amazon Stores, sold 1,000 shares on Sep 3 · sec.gov ›". Plain name order, the share count, and the Form 4 link the Pro page already has. | Lite company "What's going on" | Polish (Classic, brief) |
| 3 | **Silence the CSS preload warning** so an open DevTools console is empty. | /import, /portfolio, /paper, /signals | Polish (demo) |
| 4 | Measure the IEX vs consolidated close gap once (BX, AMZN, SPY) and replace "hasn't measured by how much" with the number. | Stock page Pro caveat | Polish (honesty) |
| 5 | VOO / IVV from their own N-PORT, like QQQ. | /fund/VOO, /fund/IVV | Polish (funds) |

Only #1 changes the overall score. #2–#5 are what a picky judge might notice after a 5.

---

## Questions a judge will ask that we can't answer yet

1. "Lite says insider selling 'has mattered for AMZN before', over a 50% hit rate. Pro says it doesn't survive the correction. Which is true?" (Answerable now, but only by switching modes.)
2. "How far is your IEX close from the consolidated close on my statement?"
3. "Why do VOO and IVV show SPY's holdings?"
4. "Home value: +232% since 2012 from a ZIP index. What's the error band?"
5. "Who pays for this, and why wouldn't a broker just add it?"
