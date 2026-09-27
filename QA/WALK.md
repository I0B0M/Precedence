# Precedence: QA walk #1

**When:** Sep 27, 2026, 00:01–00:35 ET
**Walked:** http://localhost:3000, the demo build: frontend `645b0db` on `claude/stone-shellhacks-2026-9a6325`, one commit behind `precedence-build` (`09c0219`, the Funds index; the builder has since moved on to `2743a9f`). API :8000 is served from `stone-shellhacks-2026-9a6325/backend`.
**How:** headless Chromium (Playwright 1.63), a fresh context per run, at 390×844 and 1280×800, in Lite and Pro (`stone.mode`). The 14 pages were `/`, `/import`, `/portfolio`, `/company/AMZN|BX|BLK`, `/signals`, `/fund/SPY|VOO|QQQ`, `/paper`, `/learn`, `/start` and a 404. Every visible button, tab and "Why?" in `<main>` was clicked. Every portfolio row was opened and closed. The signals matrix was 6 stocks × 3 signals in both modes. Paper trading covered buy, sell, oversell, overbuy and Reset. I opened the phone menu, pressed Escape, and followed a menu link. I added a home (ZIP 33133, $400,000, 2012-06) and a 401(k) (FXAIX, $12,000). I checked all 43 internal links.
**Not checked:** external sec.gov links (not fetched), the screenshot upload (not on :3000), colour contrast ratios, keyboard-only navigation beyond Escape, and the new Funds index (`09c0219`, not on :3000 yet).

> The site changed three times while I walked. :3006 (now stale) was tested first, and several of its bugs are **already fixed on :3000**. They are listed at the end so nobody chases them.

---

## BLOCKERS

**B1. The headline badge contradicts the page's own evidence.** This is the thing a Blackstone judge will find in the first 60 seconds.
- Lite portfolio, AMZN row: "Insiders sold shares. This has mattered for AMZN before." with the **Heads up** badge.
- Lite /company/AMZN, headline stat: a large gold **"50%"** above "6 of the last 12 times, AMZN was lower a month later." A Lite reader sees a coin flip labelled Heads up. Lite never shows the usual rate (26%).
- Pro /signals?t=AMZN&s=insider_cluster: "STRONG … Split-half hold-out: too few cases to check · 1st half 6 cases 33% vs 32% · 2nd half 5 cases 60% vs 31%". In the first half there is no edge at all.
- The same Pro pages say: "11 came out STRONG, about 6 expected by chance alone; 0 of those held up in both halves … Corrected for testing 115 pairs at once (Benjamini–Hochberg, 10% false discovery rate), 0 still stand."
- SPY/VOO/FXAIX show **WATCH** on "Hold-out: … 2nd half 5 cases 40% vs 38%".
- So the fine print says nothing survives, while the badge on the first screen says Heads up. The disclosure is excellent. The badge ignores it. (`a426f43` "fdr10_survives per signal result" exists on another branch but is not live on :3000/:8000.)

**B2. /fund/QQQ is empty on the demo path.** It shows "Invesco QQQ · **Not tested** … What's inside · **Holdings for QQQ aren't loaded yet.**" Meanwhile VOO and FXAIX, which use the same S&P proxy logic, show WATCH with full look-through. It looks unfinished, and it is inconsistent with its sibling funds.

Blocker count: **2**

---

## MINOR (exact on-screen text)

**Data/number consistency**
1. VOO footnote: "Holdings under 1% of the fund aren't tested, so they show "Not tested"." But the table directly above shows "16 JNJ 0.98% CALM", "17 INTC 0.95% CALM", "18 V 0.94% CALM".
2. With a home added, "Share of everything you own" reads **0%** on AMZN, SPY, BX, NVDA, AAPL, MSFT … ($1,248, $2,314 … of $1,346,740). The column stops telling the user anything.
3. Normal-day samples vary without explanation: AMZN insider "in a normal month: 32 of 125", BX insider "202 of 439", AMZN gap "146 of 392", BLK gap "509 days". A Pro reader will ask why AMZN's baseline is 125 days.
4. Three different "universe" counts with no explanation: landing "103 stocks tested", "504 companies inside SPY"; /start "33 companies · 10-year rate 4.96% → 5.18%"; portfolio "193 companies in all".
5. Paper: after "Bought 2 BX (practice)" the holding reads "BX 12 shares**from your portfolio**", but the portfolio holds 10. (There's also no space before "from".)
6. Paper: "Trade with $5,000 of pretend money", then "PRETEND TOTAL $9,747 · $5,000 practice cash · $4,747 in 3 holdings". Mixing in your real holdings is fine, but the headline undersells it and confuses.
7. Paper: an impossible sale (Sell 50 AMZN) still shows "Estimated proceeds $12,482" beside "You hold 5 AMZN."
8. Paper: after "Yes, reset" the last draft stays filled in: "Price $1,086.35 … Estimated cost $10,864 · Not enough practice cash."

**Lite showing jargon**
9. "Company news (8-K)" on the Lite company pages (AMZN/BX/BLK) and fund pages (SPY/VOO).
10. Lite landing: "Prices from Alpaca (IEX); badges from our tests on SEC and FRED data." and "10-year Treasury (FRED)". Lite /learn: "SEC EDGAR", "FRED", "Alpaca (IEX)". This is acceptable on /learn, less so on the hero.

**Developer / unfinished text**
11. Pro portfolio, company and fund pages: "WATCH (Lite: Heads up) = a STRONG signal for this stock is firing now. CALM (Lite: Calm) = none is." It reads like an internal legend.
12. Portfolio THIS WEEK: "69 new this week (Sep 19–25) across the companies Precedence follows, then 5 about what you own: 1 SEC filing and 4 signals firing, then 2 have mattered before for your holdings." The "then … then" sentence is hard to parse.
13. Raw SEC company names in the stock pickers (/signals, /paper): "At&T Inc.", "Us Bancorp De", "Costco Wholesale Corp /New", "Qualcomm Inc/De", "Danaher Corp /De/", "American Tower Corp /Ma/", "Wells Fargo & Company/Mn", "ELI LILLY & Co", "PROCTER & GAMBLE Co", "Duke Energy CORP", "Mcdonalds Corp", "Schwab Charles Corp". VOO also has "MU · MICRON TECHNOLOGY INC · not tracked".
14. Import: "Robinhood connect and screenshot reading: coming next." Honest, but it's the second thing a judge reads on "Add account".

**Layout / tap targets / colour**
15. 390 portfolio: "SPDR S&P 500 ETF" is clipped to "SPDR S&P 50…" (text 107px in a 95px box in Lite, 73px in Pro).
16. Tap targets under 44px at 390: header logo "Precedence" 120×21; phone-menu "How we check" 109×17; Pro /company/BX "sec.gov" 62×17.
17. Landing at 1280 runs through five unrelated backgrounds: black hero → grey 3D-monitor band → white "Funds" band with a chrome cylinder stack → navy "Honest about what isn't proven" → electric-blue "Lite for everyone". It reads as five different templates, and the blue band clashes with the gold/black product. The floating-phone / monitor-mockup style also reads like a consumer-broker marketing site (Robinhood-adjacent). No copied assets found, but it isn't distinctive.
18. /company/AMZN at 390: under the chart the white (selected-looking) chip is "The stock dropped 5% at the open 3", while the card below is about insider sales. The chart marks and the story don't match.

**Console**
19. /nope-404 logs "Failed to load resource: 404". This is expected, and the page itself is fine ("No page here · Home · Your portfolio").

**Stability (seen during the walk, not on the final :3000 pass)**
20. 00:13–00:16 ET: `/api/status`, `/api/portfolio`, `/api/companies` and `/api/lab/signals` returned **500**. Portfolio showed "Try again", and /signals for AAPL rate_jump, AAPL gap_down and NVDA insider showed "Try again in a moment." The cause was the API restarting under the demo. If that happens at the table, the demo dies.

---

## Worked, no issues
- Example → "✓ Adds up to $4,746.50, the same total the screen shows." → Save → /portfolio: $4,747 (BX 10 × $118.43, AMZN 5 × $249.63, SPY 3 × $771.35), matching /paper, /company and /fund prices.
- Home + 401(k): the total is "$1,346,740 · Includes a home estimate" = $4,747 + ~$1.33M + $12,000. The day move is "+$89 (+0.5%) … Out of the $16,747 with a daily price … A home has no daily price, so it's left out." Correct and clear.
- Every portfolio row opens and closes in both modes. The 401(k)/IRA toggle works. The castle toggles Lite↔Pro. The phone menu opens, closes on Escape, and closes on navigation.
- Paper: buy, sell (the sell picker lists only your holdings), oversell blocked ("You hold 5 AMZN."), overbuy blocked ("Not enough practice cash."), and Reset confirms with "Yes, reset / Keep it".
- Signals: all 18 stock × signal pairs render in both modes, with "Too few times to tell." for small n. The Pro case tables list entry, exit, return and SPY.
- No horizontal overflow on any page at 390 or 1280. No page errors. All 43 internal links return 200.
- No "Stone" text anywhere on :3000.

## Fixed between :3006 and :3000 (don't re-fix)
503s on `/api/filings/…/summary` on every company page · the FXAIX row headline ($7,149) disagreeing with its detail ($12,000) · 404s on `/api/companies/FXAIX` · home shown as "$1,329,994" (now "$1.33M") · day-change % taken on a different base than the headline · "3 holdings" after adding a home (now "5 things you own") · footer "Precedence, formerly Stone" · landing "109 backend tests pass".

---

## MISSING vs the brief ("understand what they own · across sources · accessible, actionable, engaging")
- **Nothing for a Blackstone investor's actual holdings.** There are no non-traded or alternative funds (BREIT, BCRED, BXPE: monthly NAV, no daily price). The home flow proves you can handle "no daily price" assets. The track sponsor's own products are the obvious next asset type.
- **Actionable:** after "Heads up" the only action is "Paper trade". There's no "what to ask / what to check next", and no alert when a signal fires.
- **Engaging:** no weekly digest, notification or watch-list. THIS WEEK exists but only on the portfolio page.
- **Accounts:** real brokerage connect is "coming next". IRA is available, but "Something else · Bonds, cash…" on /start leads nowhere specific.
- **Fund coverage:** QQQ has no holdings. VOO borrows SPY's file (disclosed). Look-through covers "68%" of SPY.
