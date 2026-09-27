# Precedence: judge scorecard #4

**Judge:** strict Blackstone VP · **Build:** :3000 @ `3443d83` (API same commit, `next dev`) · **Time:** Sep 27, 03:15 ET · **Evidence:** QA/WALK.md
**Trend:** #1 3/5 (2 blockers) → #2 4/5 (0) → #3 4/5 (0) → **#4 4/5 (0)**, with five categories now at 5.

## Scores (1–5)

| Category | #1 | #2 | #3 | **#4** | Why, in one line |
|---|---|---|---|---|---|
| Brief fit | 4 | 4 | 4 | **4** | Understands everything you own, public and private, across SEC, Fed, prices and fund files, and now brings you back with "Your week". "Actionable" still stops at "See the cases". |
| Portfolio + funds | 3 | 4 | 4 | **5** | Stocks, ETFs, 401(k), home and Blackstone funds in one correct total, with a Private-funds slice, an Investments view, look-through and BREIT/BCRED total return verified against the filings. VOO/IVV proxying SPY is disclosed. |
| Classic (Lite) clarity | 4 | 4 | 4 | **5** | Zero jargon, counts match rows, and liquidity is said plainly ("You can't always sell"). (The "has mattered" wording is scored under honesty, not here.) |
| Pro depth | 4 | 4 | 5 | **5** | Answer → evidence → sources → raw on every page type, down to each distribution's filing and record date. |
| Professional design | 3 | 4 | 4 | **5** | One palette, 44px everywhere, colours with single meanings, white prices, clean names, nothing clipped or overflowing on 17 pages × 4 configs. (The blue "5" is a nit.) |
| Data honesty | 3 | 3 | 4 | **4** | Disclosure is best in class, and the total-return numbers check out by hand. But Lite, THIS WEEK and the home still say "has mattered" where Pro says it doesn't survive the correction, and the BREIT footnote says "distributions not included" under a total-return lead. |
| Demo-readiness | 3 | 4 | 4 | **4** | Zero errors and zero failed requests this walk. Still `next dev`, and a returning user's home opens on "EXAMPLE $4,747". |
| Originality | 4 | 4 | 4 | **5** | Base-rate checks per stock, honest nulls, and Blackstone private funds priced from their own SEC filings. Nobody at Robinhood, Perplexity Finance or Fiscal.ai does this. |

**Overall: 4 / 5.** Blockers: **0**. Three categories (brief fit, data honesty, demo-readiness) stand between this and 5. Fixes 1–3 close all three.

---

## Top fixes, ranked by points gained

| # | Fix | Where | Points |
|---|---|---|---|
| 1 | **Wording only, the rule stays:** "This has mattered for AMZN before." → "This has come before drops here. Not proven." · "2 have mattered before" → "2 have come before drops" · hero "whether that kind of news has ever mattered" → "whether that kind of news has come before a drop". | Lite rows, THIS WEEK, home "Your week", home hero, /funds lines | Honesty +1 → **5** |
| 2 | **Production build for the demo:** `next build && next start` on :3000, API pinned, no restarts during judging. | :3000 (command center) | Demo +0.5 |
| 3 | **Returning home opens on the user's own total:** "Your week" and "Everything you own $1,396,740" above the hero. Hide "EXAMPLE $4,747" and "Try it with an example" once holdings are saved. | / | Demo +0.5, brief +0.25 |
| 4 | **Heads up → today's evidence:** under a firing insider signal, link the Form 4 that fired ("Andrew R. Jassy, President and CEO, 4 sales, Aug 25 · sec.gov"). The data is already on the Pro page. | Lite company "What's going on", portfolio row | Brief +1 → **5** |
| 5 | BREIT/BCRED Pro basis line: "Basis: monthly NAV and distributions from filings, class I, distributions paid (not reinvested)." | /fund/BREIT, /fund/BCRED Pro | Honesty +0.25 |
| 6 | Measure the IEX gap once: three closes (BX, AMZN, SPY) against a consolidated close, and state "within X%". | Stock page Pro caveat | Honesty +0.25 |
| 7 | "Your week" count in a neutral colour, not Calm blue. | / "Your week", /portfolio THIS WEEK | Design polish |
| 8 | VOO / IVV holdings from their own N-PORT. | /fund/VOO, /fund/IVV | Funds polish |

Fixes 1 + 2 + 3 + 4 would make every category 5 with zero blockers, which is a 5/5.

---

## Questions a judge will ask that we can't answer yet

1. "Lite says insider selling 'has mattered for AMZN before'. Pro says it doesn't survive the correction. Which is true?"
2. "I added my home. Why does the home page show me an example portfolio?"
3. "Heads up on AMZN. What exactly should I look at today?"
4. "How far is your IEX close from the consolidated close?"
5. "Why do VOO and IVV show SPY's holdings?"
6. "Home value: +232% since 2012 from a ZIP index. What's the error band?"
7. "Who pays for this, and why wouldn't a broker just add it?"
