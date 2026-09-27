# Precedence: QA walk #3

**When:** Sep 27, 2026, 02:06–02:25 ET
**Walked:** http://localhost:3000, frontend and API both at `975071c` (`precedence-build` head, "Stock page Pro: says prices are one exchange's feed (IEX)…").
**How:** as in walks #1–2. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro. **17 pages** (walk #2's 15 plus `/fund/BREIT` and `/fund/BCRED`). Every button, tab and "Why?" in `<main>` clicked; every portfolio row opened; signals 6 × 3 in both modes; paper; phone menu; home (33133, $400,000, 2012-06) + 401(k) (FXAIX, $12,000) + **BREIT $50,000**; the Everything / Investments switch; all internal links.
**Not checked:** external sec.gov links, contrast ratios, keyboard-only navigation.

## Automated results: clean
Across 17 pages × 4 configs: **0 console errors**, **0 overflow**, **0 clipped text**, **0 tap targets under 44px**, **0 Lite jargon**, **0 "Stone" or developer text**. All internal links return 200.
**One failed request:** `500 /api/companies/BX` once, during the 390-Lite portfolio load. 15 immediate retries all returned 200, and no other page load of ~90 failed. It's transient, but it's the second API hiccup in three walks.

---

## BLOCKERS
**None.**

---

## MINOR (exact on-screen text)

**Data honesty**
1. **BCRED Pro shows a loss for Blackstone's flagship credit fund:** "Change in value per share (distributions not included) · −0.2% 1 month · −1.4% 3 months · **−5.9% 12 months**". BCRED pays out most of its return as distributions, so price-only makes an income fund look like it lost money. It is disclosed, but a Blackstone judge will read "−5.9%" first. Show the distribution rate or total return from the same filings, or don't lead with price-only change.
2. **Lite still says "has mattered" on results that fail the correction:** "Insiders sold shares. This has mattered for AMZN before." and "Interest rates jumped: the whole market. This has mattered for SPY before." Pro now handles this well ("WATCH = a STRONG pattern is happening now (see Why? for how it holds up)" and "Doesn't survive the correction"). Lite asserts what Pro qualifies. The landing page already has the honest phrasing: "Has come before drops. Not a prediction."

**Numbers**
3. **"5 things you own" doesn't count BREIT.** Before BREIT (BX, AMZN, SPY, FXAIX, home) it read "5 things you own · 193 companies in all · 4 on WATCH". After adding BREIT $50,000 it still reads "5 things you own".
4. **The day-move note leaves out BREIT:** "Out of the $16,747 with a daily price. FXAIX moves with SPY. **A home has no daily price, so it's left out.**" BREIT has no daily price either, and it isn't mentioned.
5. **BREIT is folded into "Funds $52,314"** next to SPY in the allocation bar. A private real estate fund bucketed with an S&P ETF hides the one diversification fact a Blackstone investor cares about. Consider a "Private funds" slice.

**Classic (Lite) on the Blackstone funds**
6. **Lite /fund/BREIT leaves out the thing a BREIT holder most needs to understand.** It shows "$14.685 · Value per share, Aug 2026 · Blackstone real estate fund. Priced monthly. · Pays income out; value per share alone isn't your return." and a chart. Pro has "**Getting money out: Repurchases are capped at 2% of the fund's value a month and 5% a quarter.**" Lite has nothing on liquidity. BCRED is the same ("may buy back up to 5% of its shares each quarter").
7. **Lite BREIT has no "What it means for you".** Stock pages show "You own directly / Share of everything you own / A bad day could cost you". BREIT shows none of it, though the data exists (Pro portfolio row: "about 3,404.8 shares").
8. Lite shows BREIT's price as "$14.685" (three decimals, in the gold accent colour). The precision is right for Pro. In Lite, "$14.69", set in white, would match the rest of Lite.

**Actionable**
9. **"What to check: every past time ›"** goes to /signals (the history), not to what to check *now*. The Form 4 link is "once the API sends its link" (backend request). Until then, "What to check" is a second "See the cases".

**Carried over (no change)**
10. VOO / IVV: "504 holdings (SPY's file), State Street (SSGA)". QQQ now uses its own N-PORT; VOO and IVV don't.

## Fixed since walk #2 (verified today)
- The Lite count matches the rows: "**2 things worth a look today.**" (AMZN, SPY) with the example portfolio, and "3 things…" with the 401(k) added (AMZN, SPY, FXAIX).
- No "proven" anywhere. Pro: "WATCH = a STRONG pattern is happening now (see Why? for how it holds up)."
- QQQ: "What's going on · **3 of its holdings have a Heads up.**" (no more "Nothing important today").
- The allocation bar uses its own colours (teal, violet, orange, magenta), not Heads-up gold or Calm blue. The **Everything / Investments** switch works: "Stocks $2,432 4% · Funds $52,314 78% · 401(k) and IRA $12,000 18%".
- **BREIT and BCRED** are live. They're priced from their own SEC filings ("SEC EDGAR: BREIT monthly 424B3 NAV supplements", "BCRED monthly 8-K (Item 8.01)"), with a month-by-month table each linked to sec.gov, "What it invests in", "Getting money out", and "No signals are tested on a monthly-priced fund, so it shows "Not tested"". /funds has a "Blackstone funds" section: "Not traded on an exchange. Priced once a month from their own SEC filings."
- Stock page Pro: "Prices are from the IEX exchange's feed, one venue among many, so a close can differ a little from the consolidated close on a brokerage statement. Precedence hasn't measured by how much." That answers walk #1's question #6 honestly.
- "What to check: every past time ›" is on Lite company pages under a firing signal.

---

## MISSING vs the brief
- **Actionable, still thin.** After Heads up: "See the history", "What to check: every past time", "Paper trade". None of them tells the user what to look at today (who sold, how much of their stake).
- **Engaging.** No digest, no "tell me when this fires".
- **Accounts.** "Robinhood connect and screenshot reading: coming next."
- **BREIT/BCRED returns an investor would recognise:** total return including distributions.
