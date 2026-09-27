# Precedence: QA walk #2

**When:** Sep 27, 2026, 01:15–01:35 ET
**Walked:** http://localhost:3000, frontend and API both at `d513f9c` (`precedence-build` head, "Learn in Lite: sources in plain words"). :3008 serves the same commit.
**How:** as in walk #1. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro. **15 pages** (walk #1's 14 plus the new `/funds`). Every button, tab and "Why?" in `<main>` clicked; every portfolio row opened; signals 6 stocks × 3 signals in both modes; paper buy/sell/oversell/overbuy/Reset; phone menu; home (33133, $400,000, 2012-06) + 401(k) (FXAIX, $12,000); all internal links.
**Not checked:** external sec.gov links, contrast ratios, keyboard-only navigation.

## Automated results: clean
Across 15 pages × 4 configs: **0 console errors** (the 404 page's own 404 aside), **0 failed requests**, **0 horizontal overflow**, **0 clipped text**, **0 tap targets under 44px** at 390, **0 Lite jargon hits** (checked for STRONG, WATCH, 8-K, Form 4, FRED, DGS10, EDGAR, IEX, Wilson, hold-out and more), **0 "Stone" or developer text**. All internal links return 200. The API stayed up for the whole walk.

---

## BLOCKERS

**None.** Walk #1's QQQ blocker is fixed: "102 holdings, SEC N-PORT (Invesco QQQ Trust), Jun 30, 2026", and the filing's age is disclosed.

Walk #1's B1 (the badge fires on results that fail the correction) is now **your decision** ("the rule stays"). I've moved it to the scoring risk below. It no longer counts as a blocker, but it still costs points and will be asked about.

## SCORING RISK (owner decision, still costs points)

**R1. The Pro copy now contradicts itself in two adjacent lines.**
- Pro portfolio header: "**WATCH only when a signal that has proven itself on this stock is firing.**"
- Same page, on the AMZN / SPY / FXAIX rows: "STRONG**Doesn't survive the correction · too few cases in each half**" and "STRONG**Too few cases in each half**".
- Lite AMZN: a large gold "50%" above "6 of the last 12 times, AMZN was lower a month later. … **This has mattered for AMZN before.**"

The rule can stay and the words can still be honest. "Proven itself" and "has mattered" are claims the page then withdraws. A copy-only fix removes the contradiction without touching the rule (see JUDGE.md fix #1).

---

## MINOR (exact on-screen text)

1. **The Lite count doesn't match the rows.** With the example portfolio, Lite says "**3 things worth a look today.**" but shows two Heads-up rows (AMZN, SPY) and one Calm (BX). With home + 401(k) it says "**4 things worth a look today.**" with three Heads-up rows (AMZN, SPY, 401(k)). The missing one is META, which gets WATCH through SPY and appears only in Pro ("3 on WATCH").
2. **QQQ contradicts itself.** "What's going on · **Nothing important today.**" then, on the same page, "**Heads up inside: AMZN, META, CSCO.**" QQQ is "Not tested" while SPY, VOO and IVV get Heads up from the same rate-jump test. /funds explains the rest ("A fund: many stocks in one.") but not this.
3. **Colours carry two meanings.** In the allocation bar, gold is "Stocks" and blue is "Funds". Everywhere else gold is **Heads up** and blue is **Calm**. On the 390 portfolio the gold "Stocks" swatch sits directly above a gold "Heads up" pill.
4. **With a home the bar is 99% one colour**: "Stocks $2,432 0.2% · Funds $2,314 0.2% · 401(k) and IRA $12,000 0.9% · Home (estimate) About $1.33M 99%". That's correct, but it hides the investments. Pro already has "Share of your investments 72%", and the bar could offer the same.
5. **VOO and IVV borrow SPY's holdings file**: "504 holdings (SPY's file), State Street (SSGA)". It's disclosed, but QQQ now uses its own N-PORT, so VOO and IVV could too.
6. Paper: "PRETEND TOTAL $9,747" still includes your real holdings next to "$5,000 practice cash". This is clear enough now that the rows say "10 from your portfolio + 2 practice".

## Fixed since walk #1 (verified today)
- The "WATCH (Lite: Heads up) = …" legend is gone. It's replaced by "WATCH: a result that came out STRONG on this stock's past is happening again. It describes the past, not a prediction."
- The VOO footnote now reads "Stocks Precedence doesn't track show "Not tested"", which matches the table.
- With a home: "Share of everything you own 0.9%" plus "**Share of your investments 72%**" (no more column of 0%).
- Company names: "AT&T", "U.S. Bancorp", "McDonald's", "Eli Lilly", "Procter & Gamble", "Charles Schwab", "Costco Wholesale". Pro adds the legal name: "Micron Technology (Micron Technology, Inc.)".
- Paper: "BX 12 shares **10 from your portfolio + 2 practice**". An oversell shows "Estimated proceeds —". Reset clears the draft (quantity back to 1).
- Lite now says "Company news" (no "8-K") and "The SEC / The St. Louis Fed / Daily prices" on /learn.
- 390px: "SPDR S&P 500 ETF" wraps instead of clipping. Logo, menu links and sec.gov are all 44px.
- The landing page is one palette (three near-blacks: `#000`, `rgb(11,11,12)`, `rgb(20,20,22)`). The white and electric-blue bands are gone.
- The THIS WEEK sentence reads cleanly: "69 new this week … 5 about what you own: 1 SEC filing and 4 signals firing. 2 have mattered before for your holdings."
- AMZN opens on the insider chip (`aria-checked=true`), so walk #1's note #18 was wrong (my script misread the default state).

## New features walked
- **/funds**: "Your funds · Many stocks in one. Tap one to see what's inside." It lists what you own first (SPY), then VOO, IVV and QQQ. Pro adds the holdings source and date line.
- **Allocation bar**: Stocks / Funds / 401(k) and IRA / Home, with dollars and %. The totals are right.
- **Stock page**: "Up 0.1% on Friday. The market was up 0.5%. Around it: Interest rates jumped." Good, plain context.
- **One Lite/Pro pill** in the header, 44px, and it works.

---

## MISSING vs the brief
- **Nothing for Blackstone's own investors.** No non-traded funds (BREIT, BCRED, BXPE). The home flow already handles "no daily price", so the pattern exists.
- **Actionable:** after "Heads up" the actions are "See the history" and "Paper trade". There's no "what to check next", for example "Read the Form 4: who sold, and what share of their stake".
- **Engaging:** no weekly digest or "tell me when this fires".
- **Accounts:** "Robinhood connect and screenshot reading: coming next."
