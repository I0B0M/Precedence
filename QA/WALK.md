# Precedence: QA walk #5

**When:** Sep 27, 2026, 03:46–04:05 ET
**Walked:** http://localhost:3000. **Production build** (`next build` + `next start`, BUILD_ID dated 03:07) of `c5c2cc3` ("Judge #4 fixes…"). The API is at the same commit. The builder's only later commit (`91e91c7`) is a QA document, so :3000 is the current code.
**How:** as in walks #1–4. Headless Chromium, fresh contexts, 390×844 and 1280×800, Lite and Pro, 17 pages, every button, tab and "Why?" in `<main>`, every portfolio row, signals 6 × 3 in both modes, paper, phone menu, home + 401(k) + BREIT, the Investments switch, the returning-user home, all internal links.
**Not checked:** external sec.gov links, contrast ratios, keyboard-only navigation. I couldn't read the "Your week" number's colour programmatically, so the claim that it's now white is **unverified**.

## Automated results: clean
17 pages × 4 configs: **0 console errors**, **0 failed requests**, **0 overflow**, **0 clipped text**, **0 tap targets under 44px**, **0 Lite jargon**, **0 "Stone" or developer text**. All internal links return 200. The API has now been stable for two walks.
Two things are filtered out as not user-visible:
- `net::ERR_ABORTED …?_rsc=…`: Next's production link prefetches, cancelled when the script navigates away.
- A browser warning that "…/_next/static/chunks/2qrhvplt-9i4l.css was preloaded using link preload but not used within a few seconds" on /import, /portfolio, /paper and /signals. It's harmless, but it would show in a judge's open DevTools.

---

## BLOCKERS
**None.**

---

## OWNER DECISION (scored both ways in JUDGE.md)
**The Lite "has mattered" wording.** The owner is keeping it (decision at 07:30). It's shown here exactly as a Lite reader sees it:
- Home hero: "And whether that kind of news has ever mattered for that stock."
- Lite AMZN: "**50%** · Insiders sold shares. 6 of the last 12 times, AMZN was lower a month later. · **This has mattered for AMZN before.**"
- Lite rows: "Interest rates jumped: the whole market. This has mattered for SPY before." (also VOO, IVV)
- Your week / THIS WEEK: "5 about what you own · **2 have mattered before**"

Pro shows "STRONG · Doesn't survive the correction · too few cases in each half" beside the same results. The disclosure exists. The catch is that it's one tap away, in the other mode.

## MINOR (exact on-screen text)
1. **"Latest sale" is text only.** Lite AMZN: "Latest sale: Herrington Douglas J, CEO Worldwide Amazon Stores, Sep 3". The name is in SEC order (last, first, middle initial), where the rest of Lite uses plain names ("Eli Lilly", "AT&T"). There's no share count, and no link to the Form 4 (`app/company/[ticker]/page.tsx:103` renders a `<p>`). The Pro page has all three: name, shares and the sec.gov link.
2. **Preload warning in the console** (see above). If a judge opens DevTools, it's the only line there.
3. **Carried over:** VOO / IVV "504 holdings (SPY's file)". The IEX caveat says "Precedence hasn't measured by how much."

## Fixed since walk #4 (verified today)
- **Production build.** No HMR client, no dev overlay.
- **Returning home** leads with "YOUR PORTFOLIO · Close Sep 25, 2026 · $1,396,740 · Includes a home estimate" and the top three holdings with badges, "Open your portfolio" and "Add more". There's **no "EXAMPLE"** and no "Try it with an example".
- **Lite shows today's evidence:** "Latest sale: …, Sep 3" under the firing insider signal, then "See each past time this happened ›".
- **BREIT/BCRED basis line** names both: "Total return basis: NAV change plus distributions paid, not reinvested, Class I. Value per share change basis: monthly NAV, class I, distributions not included."
- QQQ in Lite: "As of Jun 30, 2026, from its quarterly filing." (N-PORT stays in Pro).

## MISSING vs the brief
- **Accounts:** "Robinhood connect and screenshot reading: coming next." That's acceptable for a hackathon, and the example, typed entry, home, 401(k), IRA and Blackstone funds cover the story.
- Nothing else material. Understand what you own ✓ · across sources ✓ · accessible (Lite) ✓ · actionable (latest sale, past cases, paper trade) ✓ · engaging (returning home, Your week) ✓.
