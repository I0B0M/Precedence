# Precedence: judge scorecard #3

**Judge:** strict Blackstone VP · **Build:** :3000 @ `975071c` (API same commit) · **Time:** Sep 27, 02:25 ET · **Evidence:** QA/WALK.md
**Trend:** walk #1 3/5 (2 blockers) → walk #2 4/5 (0) → **walk #3 4/5 (0)**

## Scores (1–5)

| Category | #1 | #2 | **#3** | Why, in one line |
|---|---|---|---|---|
| Brief fit | 4 | 4 | **4** | BREIT/BCRED from their own filings is exactly the right move for this track. "Actionable" still means "look at the history", and nothing brings the user back. |
| Portfolio + funds | 3 | 4 | **4** | Stocks, ETFs, a 401(k), a home and Blackstone funds in one total, plus look-through and an Investments view. "5 things you own" misses BREIT, BREIT sits inside "Funds", and VOO/IVV still borrow SPY's file. |
| Classic (Lite) clarity | 4 | 4 | **4** | Zero jargon, and the counts match the rows. Lite BREIT/BCRED leave out the redemption limit and "What it means for you", and Lite still says "has mattered" where Pro says it doesn't survive the correction. |
| Pro depth | 4 | 4 | **5** | Answer → evidence → sources → raw is complete on every page type now: case tables, split-half, BH correction, legal names + CIK, the IEX caveat, a month-by-month NAV table with each filing linked, repurchase terms. |
| Professional design | 3 | 4 | **4** | One palette, 44px everywhere, colours that each mean one thing. The Lite BREIT page is thin next to the stock pages (no "What it means for you" card), and the price uses the gold accent. |
| Data honesty | 3 | 3 | **4** | The contradiction inside Pro is gone, and the IEX feed and N-PORT age are disclosed. Two gaps are left: Lite's "has mattered", and BCRED leading with "−5.9% 12 months" price-only for an income fund. |
| Demo-readiness | 3 | 4 | **4** | Clean sweep across 17 pages. One transient `500 /api/companies/BX`. Still not frozen on a production build. |
| Originality | 4 | 4 | **4** | "Has this happened before for this stock, against its own usual rate, and we'll say when it's nothing", now across public and private Blackstone funds. Nothing like it at Robinhood, Perplexity Finance or Fiscal.ai. The landing's product-mockup style is the only generic-looking part. |

**Overall: 4 / 5.** Blockers: **0**. One category (Pro) is now at 5. The fixes below close the rest.

---

## Top 10 fixes, ranked by points gained

| # | Fix | Where | Points |
|---|---|---|---|
| 1 | **BREIT/BCRED returns an investor recognises:** show the distribution rate, or total return with distributions reinvested, from the same filings, next to or instead of "Change in value per share". BCRED "−5.9% 12 months" is the first thing a Blackstone judge will object to. | /fund/BCRED, /fund/BREIT Pro; /funds line | Honesty +0.5, brief +0.5 |
| 2 | **Lite BREIT/BCRED: "Getting money out" in plain words**, e.g. "You can usually take out up to 2% of the fund a month. In a rush, you may have to wait." Plus a "What it means for you" card: your $50,000, about 3,405 shares. | /fund/BREIT, /fund/BCRED Lite | Classic +0.5, brief +0.5 |
| 3 | **Lite wording on Heads up** to match Pro's honesty: "This has come before drops here. Not proven." instead of "This has mattered for AMZN before." | Lite portfolio, company, funds rows | Honesty +0.5, Classic +0.25 |
| 4 | **Count and note include BREIT:** "6 things you own", and "A home and BREIT have no daily price, so they're left out." | /portfolio header | Portfolio +0.25, honesty +0.25 |
| 5 | **Demo freeze:** `next build && next start`, API pinned, `/api/status` checked at the table. The one-off 500 this walk is exactly the surprise to rule out. | All | Demo +1 |
| 6 | **"What to check" means now:** link the firing Form 4(s) on sec.gov ("Andrew Jassy sold 20,000 shares on Aug 25") once the API sends the link. Until then, label it "See every past time". | Lite company "What's going on" | Brief +0.5 |
| 7 | **A "Private funds" slice** in the allocation bar instead of folding BREIT into "Funds". | /portfolio bar | Portfolio +0.25 |
| 8 | **VOO / IVV holdings from their own N-PORT**, like QQQ. | /fund/VOO, /fund/IVV | Funds +0.25 |
| 9 | Lite BREIT price as "$14.69" in white. Keep "$14.685" for Pro. | /fund/BREIT Lite | Design +0.25 |
| 10 | **An engagement hook that isn't a stub:** a THIS WEEK card on the landing/portfolio for "your" holdings. It exists on /portfolio, so surface it first on return. | / and /portfolio | Brief +0.25 |

Fixes 1–3 are worth more than 4–10 combined.

---

## Questions a judge will ask that we can't answer yet

1. "BCRED is down 5.9% on your page. What's its total return with distributions?"
2. "If I hold BREIT and need my money, what happens? Why isn't that on the page a normal investor sees?"
3. "Lite says insider selling 'has mattered for AMZN before'. Pro says it doesn't survive the correction. Which should my mother believe?"
4. "What does 'What to check' want me to check? It shows me the past."
5. "How often does your API fall over? I saw a 500."
6. "How stale is QQQ's June 30 look-through, and why do VOO and IVV use SPY's holdings?"
7. "Home value: +232% since 2012 from a ZIP index. What's the error band?"
8. "Who pays for this, and why wouldn't a broker just add it?"
