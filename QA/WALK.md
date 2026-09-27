# Precedence: QA walk #8 (regression re-walk of walk #7)

> **06:12–06:25 ET re-walk.** No code changed since walk #7 (the builder's only commit is `73a6fba`, QA docs), and :3000 still serves the 04:54 production build of `1b008db`. I re-ran the full suite: 17 pages × 4 configs, interactions, the signals matrix, home + 401(k) + BREIT. **The results are identical to walk #7**: 0 console messages, 0 failed requests, 0 overflow/clipped/under-44px/jargon, totals unchanged ($1,396,740), Lite wording unchanged. The API has been stable for five walks. Everything below is walk #7's report, still accurate.

---

## (Walk #7 report, still current)

**When:** Sep 27, 2026, 05:24–05:40 ET
**Walked:** http://localhost:3000. **Production build** (BUILD_ID 04:54) of `1b008db` ("VOO/IVV on their own N-PORT…"), the `precedence-build` head. The API is at the same commit.
**How:** as in walks #1–6. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro, 17 pages, every button, tab and "Why?" in `<main>`, every portfolio row, signals 6 × 3 in both modes, paper, phone menu, home + 401(k) + BREIT, the Investments switch, the returning-user home, all internal links.
**Not checked:** the contents of external sec.gov pages (links go only to www.sec.gov), contrast ratios, keyboard-only navigation, and the "Your week" number's colour.

## Automated results: fully clean
17 pages × 4 configs: **0 console messages**, **0 failed requests** (cancelled `_rsc` prefetches aside), **0 overflow**, **0 clipped text**, **0 tap targets under 44px**, **0 Lite jargon**, **0 "Stone" or developer text**. All internal links return 200, and every external link goes to www.sec.gov. The API has been stable for four walks.

---

## BLOCKERS
**None.**

## OWNER DECISION (unchanged, scored both ways in JUDGE.md)
`LITE_STRONG_WORDING` is still `mattered`. Lite AMZN: "50% · Insiders sold shares. 6 of the last 12 times, AMZN was lower a month later. · **This has mattered for AMZN before.**" Pro alongside: "STRONG · Doesn't survive the correction · too few cases in each half".

## MINOR
**None open.** Everything from walks #1–6 is fixed or is the owner decision above.

## Fixed since walk #6 (verified today)
- **One sale, both dates:** "Latest sale: Douglas J Herrington, CEO Worldwide Amazon Stores, sold 1,000 shares on Sep 1 (reported Sep 3). **sec.gov ›**". The link goes to the Form 4.
- **VOO / IVV on their own filings:** "506 holdings, SEC N-PORT (Vanguard 500 Index Fund), Jun 30, 2026; 64% in stocks Precedence tracks." · "503 holdings, SEC N-PORT (iShares Core S&P 500 ETF), Jun 30, 2026; 64%…". The VOO footnote reads "Weights from SEC N-PORT (Vanguard 500 Index Fund), as of Jun 30, 2026".

## Still true, disclosed, not scored against
- The IEX caveat: "Precedence hasn't measured by how much." That's honest, but a judge may ask.
- The N-PORT holdings are dated Jun 30 ("published about two months after that date"). That's disclosed.

## MISSING vs the brief
Nothing material.
