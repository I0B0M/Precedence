# Precedence: judge scorecard #2

**Judge:** strict Blackstone VP · **Build:** :3000 @ `d513f9c` (API same commit) · **Time:** Sep 27, 01:35 ET · **Evidence:** QA/WALK.md · **Previous:** walk #1 = 3/5, 2 blockers

## Scores (1–5)

| Category | #1 | **#2** | Why, in one line |
|---|---|---|---|
| Brief fit | 4 | **4** | Understands what you own across SEC, Fed, prices, fund files and a home. Still nothing for a Blackstone investor's alternatives, and still thin on "actionable". |
| Portfolio + funds | 3 | **4** | QQQ has real N-PORT holdings, /funds exists, the allocation bar and "Share of your investments" work. VOO and IVV borrow SPY's file, and QQQ's "Nothing important today" contradicts "Heads up inside". |
| Classic (Lite) clarity | 4 | **4** | Zero jargon now. "3 things worth a look today" doesn't match the two rows shown, and "This has mattered for AMZN before" sits on a 50% hit rate. |
| Pro depth | 4 | **4** | Answer → evidence → sources → raw is excellent (legal names + CIK, why ordinary-day counts differ). The top line "a signal that has proven itself" is withdrawn by the layer under it. |
| Professional design | 3 | **4** | One palette, 44px everywhere, clean names, nothing clipped. Gold and blue mean both asset class and badge. |
| Data honesty | 3 | **3** | The disclosure is better than any competitor's. But the words "proven itself" and "has mattered" still sit beside "Doesn't survive the correction". That's owner-decided, and it's scored anyway, because a judge will read both lines. |
| Demo-readiness | 3 | **4** | 15 pages × 4 configs with zero console errors, zero failed requests, API stable. Not frozen yet (production build, no restarts). |
| Originality | 4 | **4** | "Has this happened before for this stock, against its own usual rate, and we'll tell you when it's nothing" is unlike Robinhood, Perplexity Finance or Fiscal.ai. |

**Overall: 4 / 5** (up from 3). Blockers: **0** (down from 2). Not 5: no category is at 5 yet.

---

## Top 10 fixes, ranked by points gained

| # | Fix | Where | Points |
|---|---|---|---|
| 1 | **Copy-only honesty fix that keeps your rule.** Replace "WATCH only when a signal that has proven itself on this stock is firing" with, e.g., "WATCH when something that came before drops here is happening again. None of these has passed every check yet". Replace Lite's "This has mattered for AMZN before." with "This has come before drops here. Not proven." (the landing already uses "Has come before drops. Not a prediction."). | Pro portfolio header; Lite portfolio, company and fund rows | Honesty +1, Pro +0.5 |
| 2 | **Lite count = rows shown.** Either show META ("inside SPY") in Lite, or count only what Lite lists. "3 things worth a look today" above 2 flagged rows is the first number a judge checks. | /portfolio Lite | Classic +0.5, honesty +0.25 |
| 3 | **A Blackstone-shaped asset.** Under "Something else", add a non-traded fund (BREIT / BCRED / BXPE) by amount, with "monthly value, no daily price", handled like the home. It's the single biggest brief-fit gain available at this track. | /import, /start, /portfolio | Brief +1 |
| 4 | **Make Heads up actionable.** One line under each Heads up: "What to check: who sold and how much (Form 4) ›", "What rose: the 10-year rate ›". It links to the evidence you already have. | Portfolio rows, company "What's going on" | Brief +0.5, Classic +0.25 |
| 5 | **QQQ "What's going on"** should say "3 companies inside have a Heads up: AMZN, META, CSCO", plus one line on why the fund itself isn't tested. | /fund/QQQ, /funds | Funds +0.5 |
| 6 | **Freeze the demo:** `next build && next start`, API pinned, `/api/status` checked before the table. | All | Demo +1 |
| 7 | **Separate colour meanings:** don't reuse Heads-up gold and Calm blue in the allocation bar. | /portfolio bar | Design +0.5 |
| 8 | **VOO / IVV holdings from their own N-PORT**, like QQQ, instead of "(SPY's file)". | /fund/VOO, /fund/IVV, /funds | Funds +0.25 |
| 9 | **The allocation bar with a home:** add an "investments only" toggle, or a second bar, so $16,747 isn't a 1% sliver. | /portfolio | Portfolio +0.25 |
| 10 | **Home estimate range in Pro**: "FHFA ZIP 33133 index, typical error ±X%". | Also yours → Home → Why? | Honesty +0.25 |

Fixes 1–3 are worth more than 4–10 combined.

---

## Questions a judge will ask that we can't answer yet

1. "The header says 'proven itself', and the line below says 'doesn't survive the correction'. Which is it?"
2. "How does this work for BREIT or BCRED, the products our investors hold? No daily price, monthly NAV."
3. "I see Heads up on AMZN. What do you want me to *do*?"
4. "Your Lite page says 3 things are worth a look. I can see 2. Where's the third?"
5. "QQQ holdings are from June 30. How stale is too stale for a look-through?"
6. "Prices are IEX. Does your close match the consolidated close on a brokerage statement?"
7. "Home value: +232% since 2012 from a ZIP index. What's the error band?"
8. "Look-through covers 68% of SPY and 60% of QQQ. What about the rest?"
9. "Who pays for this, and why wouldn't a broker just add it?"
