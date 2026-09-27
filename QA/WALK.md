# Precedence: QA walk #4

**When:** Sep 27, 2026, 02:56–03:15 ET
**Walked:** http://localhost:3000, frontend and API both at `3443d83` (`precedence-build` head, "Home: coming back with holdings shows 'Your week' first…"). :3000 is **still `next dev`**: the page loads `[turbopack]_browser_dev_hmr-client` and `next-devtools`.
**How:** as in walks #1–3. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro. 17 pages, every button, tab and "Why?" in `<main>`, every portfolio row, signals 6 × 3 in both modes, paper, phone menu, home (33133, $400,000, 2012-06) + 401(k) (FXAIX, $12,000) + BREIT $50,000, the Everything / Investments switch, the returning-user home, all internal links.
**Not checked:** external sec.gov links, contrast ratios, keyboard-only navigation.

## Automated results: fully clean
17 pages × 4 configs: **0 console errors**, **0 failed requests** (none this walk, including the targeted and signals runs), **0 overflow**, **0 clipped text**, **0 tap targets under 44px**, **0 Lite jargon**, **0 "Stone" or developer text**. All internal links return 200.

**Numbers checked by hand.** BREIT 12-month total return: $13.8281 → $14.685 (+6.2%) plus the Sep 2025–Aug 2026 distributions (~$0.662, +4.8%) = **+11.0%**, matching the page. BCRED: $25.09 → $23.60 (−5.9%) plus ~$2.38 (+9.5%) = **+3.5%**, matching the page. Portfolio: $4,747 + ~$1.33M + $12,000 + $50,000 = **$1,396,740**, matching.

---

## BLOCKERS
**None.**

---

## MINOR (exact on-screen text)

1. **"Has mattered" still asserts what Pro says doesn't survive the correction.** This is the fourth walk in a row, and it's now the main thing between us and a 5 on honesty.
   - Lite rows: "Insiders sold shares. This has mattered for AMZN before." · "Interest rates jumped: the whole market. This has mattered for SPY before." (also on /funds for VOO and IVV)
   - THIS WEEK, and the new home "Your week": "5 about what you own · **2 have mattered before**"
   - Home hero: "And whether that kind of news has ever mattered for that stock."
   - Pro, same stocks: "STRONG · Doesn't survive the correction · too few cases in each half".
   The rule can stay. The words don't have to claim more than the evidence does. The landing page already says it right: "Has come before drops. Not a prediction."
2. **A returning user sees an example, not their own total, first.** With home + 401(k) + BREIT saved (portfolio "$1,396,740"), the home page opens with "Try it with an example · Add your account" and a card reading "**EXAMPLE** · Close Sep 25, 2026 · **$4,747**". Only below that comes "YOUR WEEK · What happened to what you own". The commit says "shows 'Your week' first". On the phone, "Your week" is the third block. A judge who adds a home and taps the logo sees someone else's number.
3. **The BREIT/BCRED Pro footnote contradicts the new lead.** The page now leads with "**Total return (distributions paid, not reinvested)** +11.0% 12 months", but the basis line underneath still says "Basis: monthly NAV, class I, **distributions not included**."
4. The big "5" in "YOUR WEEK · THIS WEEK" is set in Calm blue. Blue means Calm everywhere else, and this number counts things that include Heads-up items.
5. VOO / IVV: "504 holdings (SPY's file), State Street (SSGA)". Carried over. QQQ uses its own N-PORT.
6. The stock-page IEX caveat says "Precedence hasn't measured by how much." That's honest, but a judge will ask, and three closes (BX, AMZN, SPY) against any consolidated close would answer it.

## Fixed since walk #3 (verified today)
- **BREIT/BCRED total return:** Lite "Total return over 12 months: +11.0%. Includes the income it paid out." / BCRED "+3.5%". Pro leads with total return, puts the value-per-share change second, and lists every distribution with its filing. BCRED's "Sep 2026 · after the latest value, so not in any return yet" is a nice touch.
- **Lite liquidity:** "You can't always sell: withdrawals are limited each month." (BREIT), "buybacks are limited each quarter." (BCRED), also on the portfolio's BREIT row.
- **Lite BREIT "What it means for you":** "What you entered $50,000 · About 3,405 shares · The value you entered is what counts in your total."
- **Counts:** "6 things you own", and "BREIT is priced monthly, so it's left out." in the day note.
- **Allocation bar:** its own "Private funds $50,000 4%" slice. Investments view: "Private funds $50,000 75%".
- Lite BREIT price "$14.69"; Pro keeps "$14.685".
- "What to check: every past time" is relabelled "See the cases ›", so the link says where it goes.

## New features walked
- **Returning-user home** with a "YOUR WEEK · What happened to what you own" card and "Open your portfolio" (see MINOR #2 for its position).

---

## MISSING vs the brief
- **Actionable:** after Heads up, the user can "See the cases" or "Paper trade". Nothing points at *today's* evidence, such as the Form 4 that fired: "Andrew Jassy, 3 sales, Aug 25".
- **Accounts:** "Robinhood connect and screenshot reading: coming next."
- **Demo freeze:** still `next dev`.
