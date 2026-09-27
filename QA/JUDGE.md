# Precedence: judge scorecard #1

**Judge:** strict Blackstone VP · **Build:** :3000 @ `645b0db` (API :8000, shellhacks backend) · **Time:** Sep 27, 00:35 ET · **Evidence:** QA/WALK.md

## Scores (1–5)

| Category | Score | Why, in one line |
|---|---|---|
| Brief fit | **4** | It answers "what do I own and does this news matter", from SEC + FRED + prices + fund files, with look-through into funds and a home. But nothing touches the alternatives a Blackstone investor actually holds. |
| Portfolio + funds | **3** | The totals are right, home + 401(k) work, and look-through works. But QQQ is empty ("Holdings for QQQ aren't loaded yet."), VOO borrows SPY's file, and the share column goes to 0% once a home is added. |
| Classic (Lite) clarity | **4** | Plain sentences everywhere ("No clear pattern for BX."). "8-K" and "FRED/IEX" leak in, and "Heads up" sits on a 50% coin flip without the usual rate beside it. |
| Pro depth (answer → evidence → sources → raw) | **4** | The best part of the product: verdict → case table → sec.gov links and accession numbers → raw XBRL concepts. Held back by the internal legend "WATCH (Lite: Heads up) …" and baselines that change size without explanation (125 vs 396 vs 439 days). |
| Professional design | **3** | The product pages are tidy and consistent (gold Heads up, blue Calm, one card style). The landing page is five different templates stacked up. Raw SEC names ("At&T Inc.", "Us Bancorp De"), a clipped "SPDR S&P 50…", and sub-44px tap targets. |
| Data honesty | **3** | The disclosure is outstanding ("0 still stand" after BH; split-half hold-out shown). But the headline badge ignores it: AMZN is Heads up on a first-half edge of 33% vs 32%. A contradicted VOO footnote. That gap between the badge and the evidence is the whole pitch, and right now it cuts against us. |
| Demo-readiness | **3** | The happy path works end to end with zero console errors on :3000. But the API returned 500 for ~3 minutes mid-walk when it was restarted. Three servers on three branches ran tonight, and :3000 is a commit behind. QQQ is a dead end on the scripted path. |
| Originality vs Robinhood / Perplexity Finance / Fiscal.ai | **4** | "Has this mattered for this stock before, against its own usual rate, and we'll say when it hasn't" is genuinely different from a news feed (Robinhood), an LLM summary (Perplexity) or a fundamentals terminal (Fiscal.ai). The landing page's phone and monitor mockups read as generic broker marketing. |

**Overall: 3 / 5.** Blockers: **2** (badge contradicts evidence; QQQ empty). Not a 5 until every row is 5 and there are zero blockers.

---

## Top 10 fixes, ranked by points gained

| # | Fix | Where it shows | Points |
|---|---|---|---|
| 1 | **Make the badge obey the page's own tests.** A STRONG result that fails the split-half hold-out or the BH-10% correction must not drive Heads up/WATCH. Show it as Calm with "an early sign, not proven", or add a third state. Ship the `fdr10_survives` field (merged in `a426f43`) end to end and restart :8000 on it **before** the freeze. | Portfolio rows, company badges, fund badges, Lite AMZN "This has mattered for AMZN before." | Data honesty +1.5, Pro +0.5, brief +0.5, removes B1 |
| 2 | **Lite shows the usual rate next to the hit rate:** "6 of the last 12 times AMZN was lower a month later, against about 3 in 12 on a usual month." Drop the lone gold "50%" headline. | /company/*, /signals in Lite | Classic +1, honesty +0.5 |
| 3 | **QQQ holdings** (Invesco's daily file), or take QQQ off every path a judge can click until it has them. Make "Not tested" vs VOO's WATCH consistent. | /fund/QQQ, Funds index, /paper picker | Funds +1, demo +0.5, removes B2 |
| 4 | **Freeze the demo stack:** one branch, a `next build && next start` production server, the API pinned and never restarted during judging, a `/api/status` check before walking up to the table. | All | Demo +1.5 |
| 5 | Delete the "WATCH (Lite: Heads up) = … CALM (Lite: Calm) = none is." legend. Put one plain line under the first badge instead. | Pro portfolio / company / fund | Design +0.5, Pro +0.5 |
| 6 | Fix the VOO footnote ("Holdings under 1% … show "Not tested"") so it matches the table (JNJ 0.98% CALM), or change the table. | /fund/VOO | Honesty +0.5 |
| 7 | With a home, show "Share of what you invest" (or "under 1%") instead of a column of 0%. | /portfolio rows | Portfolio +0.5 |
| 8 | Clean company names once, server-side: title case, strip "/De/", "Inc/De", "/New", "/Mn", and fix "At&T" / "Us Bancorp" / "Mcdonalds". | /signals, /paper pickers, VOO table | Design +0.5 |
| 9 | Paper polish: split "from your portfolio" from practice shares ("10 from your portfolio + 2 practice"), hide proceeds on an invalid sale, clear the draft on Reset, and say "Your holdings + $5,000 pretend cash". | /paper | Demo +0.25, honesty +0.25 |
| 10 | Mobile and visual polish: un-clip "SPDR S&P 500 ETF", give the logo, "How we check" and "sec.gov" 44px targets, bring the landing onto one palette (drop the electric-blue and white bands), and make the default chart chip match the card's story. | 390 portfolio, header, menu, landing, /company | Design +0.5 |

Fixes 1–4 are worth more than 5–10 combined. Do them first.

---

## Questions a judge will ask that we can't answer yet

1. "Your own page says 0 of 11 STRONG results survive the correction and about 6 are expected by luck. So why is AMZN on Heads up?"
2. "AMZN's insider signal: first half 33% vs 32%, second half 60% vs 31%. Isn't that just this year's sell-off, not insider selling?"
3. "Why is AMZN's usual-month baseline only 125 days, when BX's is 439 and the rate test's is 396?"
4. "How does this work for our investors: BREIT, BCRED, BXPE, non-traded, monthly NAV? What does look-through mean for a private fund?"
5. "What should I *do* after Heads up? Paper trading isn't an action for a 401(k) holder."
6. "Prices are Alpaca IEX, a few percent of volume. Does your close match the consolidated close you'd see on a statement?"
7. "VOO uses SPY's holdings file and QQQ has none. How do you handle a fund whose holdings you can't get? Active funds? Target-date funds in a 401(k)?"
8. "The home estimate is FHFA ZIP change × purchase price: +232% since 2012 for 33133. What's the error band, and why show it next to live prices?"
9. "Look-through covers 68% of SPY. What happens to the other 32%?"
10. "Who pays for this, and why wouldn't a broker just add it?"
