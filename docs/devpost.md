# Devpost submission: Precedence (ShellHacks 2026, Blackstone track)

Everything below is ready to paste. Replace the three placeholders in ⟨angle brackets⟩: the Netlify URL, the
video link and the Devpost usernames. Field names follow Devpost's submission form.

---

## Project name

Precedence

## Elevator pitch (one line, under 200 characters)

Start from what you own, and test whether the news ever mattered. Every holding stays Calm until a kind of news that has actually mattered for it before is happening now.

## Track / challenge

Blackstone: Reimagining the Investor Experience

## Try it out (links)

- Live demo (saved real data, no sign-in): ⟨https://YOUR-SITE.netlify.app⟩
- Code: https://github.com/I0B0M/Stone
- Best pages to open on the demo: `/briefing` (press Play), `/company/BX` (tap the O for Pro), `/signals`

## Video demo

⟨YouTube or Vimeo link, 3 minutes⟩

## Image gallery (suggested order)

1. The landing hero with the orb ("All your investments in one place")
2. Portfolio board: the total, Calm and Heads up rows, the "What you really own" treemap
3. Briefing tab mid-sentence, captions lit, the evidence card showing Amazon · Heads up
4. Company page for BX in Pro: candles, the signal's cases, the 90% range and the hold-out
5. Signals page: AMZN insider selling, 6 of the last 12 times against 26% of normal months
6. Import: a brokerage screenshot read into rows that add up to the printed total

## Built with (tags)

python, fastapi, postgresql, next.js, react, typescript, three.js, gemini, quantstats, scipy, statsmodels, pandas, sec-edgar, xbrl, alpaca, fred, kokoro, netlify, uv, vitest, pytest

---

## About the project

### Inspiration

Blackstone's brief said investors have more information than ever, spread across sources, and that
understanding what they own is still hard. We noticed the opposite problem is worse: every app sends
alerts, and almost none of them can say whether the thing they're alerting about has ever mattered for
that stock. So we built the app that starts from what you own and refuses to worry you without
precedent. That's the name.

### What it does

Precedence pulls SEC filings, XBRL financials, Form 4 insider sales, two years of daily prices, the
10-year Treasury yield and fund holdings into one screen per holding, for 103 S&P 100 stocks plus the
big index funds, a 401(k), a home, and Blackstone's BREIT and BCRED.

For each holding it tests three kinds of news against that stock's own history: a cluster of insider
sales, a jump in rates, and a 5% gap down at the open. It counts every past case, checks what the stock
did next against its own normal days, and puts a 90% range around the answer. A holding is **Calm**
unless a signal that passed that test is firing right now; then it gets a **Heads up**. When the history
doesn't back the worry, it says **not proven** out loud, which is most of the time.

Two views of the same data: **Lite** in plain words and dollars, **Pro** with the working shown (every
case, the hold-out, the stricter test, the multiple-testing correction, links to the filings).

The **Briefing** tab reads your portfolio to you: an animated orb, a recorded voice, word-synced captions,
and beside every sentence the evidence it came from, one tap from the page that proves it. It talks; it
never listens. **Import** reads a brokerage screenshot and refuses any reading whose rows don't add up
to the printed total. **Paper trading** lets you try a trade with pretend money; no order is ever sent.

### How we built it

- **Data.** A Python pipeline (FastAPI, psycopg, Postgres 16) with one client per source, split into a
  cached, rate-limited fetch and pure parsers that are unit-tested against sample files. Every write is
  an upsert, so a re-run only fetches what's missing. SEC EDGAR, Alpaca (IEX feed), FRED, State Street's
  SPY file, SEC N-PORT for VOO, IVV and QQQ, FHFA's house price index, the Census geocoder.
- **The signal engine** is pure functions with no I/O: event timing from SEC acceptance times, next-open
  entry, normal days, Wilson and Newcombe intervals, a split-half hold-out, Benjamini-Hochberg across the
  scan. The tests check it against statsmodels and SciPy to 1e-14, and a mutation script breaks one rule
  at a time to prove each test can fail.
- **The briefing** is a panel of experts, each a tested rule over one kind of evidence (signals, the
  market, risk, look-through, figures, filings), and a gate that speaks the most salient points within a
  line budget and lists what it held back. Every number in every sentence must round-trip to its source
  or the line is never spoken. The voice is Kokoro-82M, an open-weight speech model, recorded ahead of
  time; the orb is Three.js.
- **AI where reading is the job, checked where it counts.** Gemini reads screenshots and summarizes
  filings; the screenshot rows must reconcile to the printed total and every figure in a summary must
  match the filing's own XBRL. No model assigns a label, a Heads up, or a number.
- **The frontend** is Next.js 16, React 19 and TypeScript, with a saved-data mode that serves real API
  responses from one market close so the public demo needs no server.

### Challenges we ran into

- **Saying "not proven" honestly.** In our scan, 11 of the 115 stock-signal pairs with enough cases came
  out STRONG, and about 6 would by chance; none survive the false-discovery correction. Pro says exactly
  that instead of hiding it.
- **Timing.** A filing "known at" the wrong minute moves a case by a day. SEC acceptance times are UTC
  despite the format, and the 10-year yield is published the next afternoon; we verified both against
  the sources.
- **Market-wide news.** A rate jump hits every stock at once, so "the stock fell" is the market falling.
  That signal is judged against SPY over the same days, and a placebo check showed why it has to be.
- **A narrator that can't lie.** The easy path was a language model writing the script. We built the
  check first, then found the rules could pass it and a model couldn't be made to, so the rules speak.

### Accomplishments that we're proud of

- Real data end to end, with every number carrying its source and an as-of date.
- A statistics engine that matches the reference libraries to machine precision, with a mutation check
  that proves the tests bite.
- A spoken briefing where every sentence is grounded and the evidence is one tap away.
- Screenshot import that refuses to guess: rows must add up to the total on the picture.
- A demo that never goes down, because it needs no server.

### What we learned

Most "signals" people worry about don't hold up on a single stock's history, and an app that admits
that is more useful than one that alerts. Precise timing matters more than clever models. And a
language model is most valuable where reading is the job, as long as something else checks what it read.

### What's next

Trained finance models come in as **Readers** that can only propose cases for the same engine to test:
FinBERT tone on 8-K text is already wired in behind a flag, with a placebo calibration script that keeps
the false-STRONG rate near 5%. A local summarizer (Ollama) is behind a second flag. A hosted backend
and a `live` deploy will put the full app online; brokerage connections (SnapTrade) after that.

---

## External libraries and models (every one, as the rules ask)

| Library or model | License | Used for |
|---|---|---|
| FastAPI | MIT | HTTP API |
| Uvicorn | BSD-3 | API server |
| psycopg 3 | LGPL-3 | Postgres driver |
| python-multipart | Apache-2.0 | Screenshot uploads |
| httpx | BSD-3 | HTTP client for outside APIs |
| python-dotenv | BSD-3 | Reading `.env` |
| QuantStats | Apache-2.0 | Risk card: volatility, max drawdown, beta, Sharpe, worst day |
| pandas, NumPy, SciPy | BSD-3 | Used by QuantStats; SciPy checks the engine's binomial tail in tests |
| pytest | MIT | Tests |
| statsmodels | BSD-3 | Tests only: the engine's Wilson range and Benjamini-Hochberg must match it |
| yfinance | Apache-2.0 | Saved-data build only: SPY's daily bars and daily high/low (labeled Yahoo Finance) |
| Pillow | MIT-CMU | Drawing the demo screenshot (one-off script) |
| Next.js | MIT | The web app |
| React | MIT | UI |
| TypeScript | Apache-2.0 | Types |
| TradingView Lightweight Charts | Apache-2.0 | Pro candles (keeps TradingView's attribution) |
| d3-hierarchy | ISC | The "What you really own" treemap layout |
| driver.js | MIT | The guided tour |
| three.js | MIT | The Briefing's orb (renderer ported from Eno, MIT) |
| Vitest | MIT | Frontend unit tests |
| ESLint | MIT | Frontend lint |
| Epilogue, Alegreya, Doto (Google Fonts) | SIL OFL 1.1 | Type |
| Kokoro-82M (hexgrad), misaki, PyTorch | Apache-2.0, Apache-2.0, BSD-3 | The Briefing's recorded voice (one-off script) |
| Hugging Face Transformers, PyTorch | Apache-2.0, BSD-3 | Optional v2 Reader (FinBERT), off by default |
| ProsusAI/finbert (model) | see its model card | Optional v2 Reader, off by default |
| Ollama | MIT | Optional v2 local summarizer, off by default |

Data and APIs: SEC EDGAR (no key, contact email), Alpaca Market Data (free key), FRED (free key; not
endorsed by the Federal Reserve Bank of St. Louis), State Street SPY holdings file, FHFA House Price
Index, US Census Geocoder, OpenStreetMap tiles (credited on the map), Google Gemini API (free key),
Yahoo Finance through yfinance (saved-data build only).

Research: Boudoukh, Feldman, Kogan & Richardson (NBER w18725); Wilson (1927); Newcombe (1998), method 10;
Benjamini & Hochberg (1995).

## Team

- ⟨Devpost username⟩ (GitHub @I0B0M)
- ⟨Devpost username⟩ (GitHub @blondres04)

## Notes for the form

- **Built at the event:** yes. The repository's history starts Sep 26, 2026; the v2 scaffolding (Readers,
  deploy specs) was pushed after the Sunday freeze and is off by default.
- **Not investment advice:** say so wherever the form allows; the app's footer already does.
- **If the form asks about AI use in the product:** Gemini reads screenshots and filings (both checked
  against the source numbers); Kokoro-82M voices sentences that are already written; no model decides
  a label, a Heads up or a number.
