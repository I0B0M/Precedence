# Precedence: QA walk #9 (final, 06:59–07:12 ET)

**Walked:** http://localhost:3000, the production build (BUILD_ID 04:54) of `1b008db`, with the API at the same commit. No code has changed since walk #7; the builder's later commits (`73a6fba`, `db8784c`) are QA documents only. `LITE_STRONG_WORDING` is `"mattered"` (`frontend/src/lib/flags.ts:9`).
**How:** the same suite as every walk since #1. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro. 17 pages: `/`, `/import`, `/portfolio`, `/company/AMZN|BX|BLK`, `/signals`, `/funds`, `/fund/SPY|VOO|QQQ|BREIT|BCRED`, `/paper`, `/learn`, `/start`, 404. Every button, tab and "Why?" in `<main>`, every portfolio row, signals 6 stocks × 3 signals in both modes, paper buy/sell/oversell/overbuy/Reset, phone menu, home (33133, $400,000, 2012) + 401(k) (FXAIX, $12,000) + BREIT $50,000, the Investments switch, the returning-user home, all links.
**Never checked all night:** the contents of external sec.gov pages, colour contrast ratios, keyboard-only navigation, and the "Your week" number's colour.

## Results: identical to walks #7 and #8
17 pages × 4 configs: **0 console messages**, **0 failed requests** (cancelled `_rsc` link prefetches aside), **0 overflow**, **0 clipped text**, **0 tap targets under 44px**, **0 Lite jargon**, **0 "Stone" or developer text**. Totals: example "$4,747"; with home + 401(k) + BREIT "$1,396,740". The API has been stable for six walks (last failure: a single transient 500 at walk #3).

## BLOCKERS
**None.**

## OWNER DECISION
Lite wording, as shipped: "Insiders sold shares. 6 of the last 12 times, AMZN was lower a month later. · **This has mattered for AMZN before.**" · "Interest rates jumped: the whole market. **This has mattered for SPY before.**" Pro alongside: "STRONG · Doesn't survive the correction · too few cases in each half". To change it, set `LITE_STRONG_WORDING = "not-proven"` in `flags.ts:9` and rebuild :3000.

## MINOR
**None open.**

## MISSING vs the brief
Nothing material. Real brokerage connect is "coming next". The example, typed entry, home, 401(k), IRA and Blackstone funds carry the demo.

---

## What changed overnight (walk #1 → #9)
| Walk | Time | Build | Overall | Blockers |
|---|---|---|---|---|
| 1 | 00:35 | :3000 `645b0db` (dev) | 3/5 | 2 (badge vs evidence; QQQ empty) |
| 2 | 01:35 | `d513f9c` (dev) | 4/5 | 0 |
| 3 | 02:25 | `975071c` (dev) | 4/5 | 0 |
| 4 | 03:15 | `3443d83` (dev) | 4/5 | 0 |
| 5 | 04:05 | `c5c2cc3` (**prod**) | 4/5 · 5/5 with wording | 0 |
| 6 | 04:50 | `a6c4f41` (prod) | 4/5 · 5/5 with wording | 0 |
| 7 | 05:40 | `1b008db` (prod) | 4/5 · 5/5 with wording | 0, 0 minors |
| 8 | 06:25 | `1b008db` (prod) | same | 0, 0 minors |
| 9 | 07:12 | `1b008db` (prod) | same | 0, 0 minors |
