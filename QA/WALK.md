# Precedence: QA walk #6

**When:** Sep 27, 2026, 04:36–04:50 ET
**Walked:** http://localhost:3000. **Production build** (BUILD_ID 04:06) of `a6c4f41` ("No console warning in production…"), the `precedence-build` head. The API is at the same commit.
**How:** as in walks #1–5. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro, 17 pages, every button, tab and "Why?" in `<main>`, every portfolio row, signals 6 × 3 in both modes, paper, phone menu, home + 401(k) + BREIT, the Investments switch, the returning-user home, all internal links.
**Not checked:** external sec.gov links, contrast ratios, keyboard-only navigation, and (still) the "Your week" number's colour.

## Automated results: fully clean
17 pages × 4 configs: **0 console messages of any kind** (the CSS preload warning is gone), **0 failed requests** (cancelled `_rsc` link prefetches aside), **0 overflow**, **0 clipped text**, **0 tap targets under 44px**, **0 Lite jargon**, **0 "Stone" or developer text**. All internal links return 200. The API has been stable for three walks.

---

## BLOCKERS
**None.**

## OWNER DECISION (unchanged, scored both ways in JUDGE.md)
The Lite wording is still the shipped copy (`LITE_STRONG_WORDING` = `mattered`, per `6ef1c11`):
- Lite AMZN: "50% · Insiders sold shares. 6 of the last 12 times, AMZN was lower a month later. · **This has mattered for AMZN before.**"
- Lite /signals: "This has mattered for AMZN before. · Happening now (Sep 3, 2026). That's why AMZN is Heads up."
- Home hero, Your week and THIS WEEK: as in walk #5.

Pro alongside: "STRONG · Doesn't survive the correction · too few cases in each half". The switch exists, so flipping it to `not-proven` is a one-line change.

## MINOR (exact on-screen text)
1. **Two dates for one sale on the same Lite page.** "Latest sale: Douglas J Herrington, CEO Worldwide Amazon Stores, sold 1,000 shares **on Sep 1**." Then, under "What's new", "Insiders sold shares · **Sep 3, 2026**". /signals says "Happening now (**Sep 3, 2026**)". Sep 1 is the trade date and Sep 3 is the SEC filing date, and both are right. But a reader sees two dates for one event. Suggest "sold 1,000 shares on Sep 1 (reported Sep 3)".
2. "Latest sale" still has no sec.gov link. The commit says it comes "once the API sends the link".
3. **Carried over:** VOO / IVV "504 holdings (SPY's file)". The IEX caveat still says "Precedence hasn't measured by how much."

## Fixed since walk #5 (verified today)
- **Latest sale in plain words:** first-name order, the share count and the trade date: "Douglas J Herrington, CEO Worldwide Amazon Stores, sold 1,000 shares on Sep 1."
- **Console clean in production:** no more "…css was preloaded using link preload but not used…" on /import, /portfolio, /paper or /signals.
- The returning home still opens on "YOUR PORTFOLIO $1,396,740" with no example.

## MISSING vs the brief
Nothing material. Accounts connect is "coming next", and the example, typed entry, home, 401(k), IRA and Blackstone funds cover the story.
