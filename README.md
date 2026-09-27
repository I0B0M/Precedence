# ST◯NE

Built at ShellHacks 2026 for the Blackstone track, "Reimagining the Investor Experience".

Investors have more information than ever, spread across filings, prices, rates and news.
Stone starts from **what you own**, pulls those sources into one screen per holding, and
**tests whether a kind of news has ever actually mattered for that stock** before it asks
for your attention. Each holding is CALM, or WATCH when a proven signal is firing.

- **Lite** (default): plain words, dollars.
- **Pro**: the same data with the working shown. Tap the O in the logo to switch.

## How it fits together

```
SEC EDGAR ─┐
Alpaca   ──┤
FRED     ──┼─> fetch.py (rate limit + disk cache) ─> ingest/ ─> Postgres (Tiger Data)
SSGA     ──┘                                                        │
                                          signals/ (pure functions) ┤
                                                                    └─> FastAPI ─> Next.js
```

- `backend/stone/sources/`: one client per outside source. Each splits into **fetch**
  (cached HTTP) and **parse** (pure functions, unit-tested against small sample files).
- `backend/stone/signals/`: the signal engine. No I/O, so it is fully unit-tested.
- `backend/stone/portfolio/`: exposure (including what you hold inside ETFs) and the
  screenshot reconcile check.
- `frontend/`: Next.js app.

## Real vs sample data

Every database row has a `source`. `scripts/seed_sample.py` fills the database with
**fictional** companies (HLCN, MRDN, ORCA, BRVE, BRD500) for development. While any sample
rows exist, the UI shows a SAMPLE DATA banner. `scripts/ingest_all.py` loads the real
tickers from SEC, Alpaca and FRED; `scripts/ingest_etfs.py` loads SPY's holdings from State Street.

## Live demo (saved data)

`netlify.toml` builds only the frontend with `NEXT_PUBLIC_STONE_SAVED=1`. The site then reads real API responses
saved in `frontend/public/saved/` (built by `backend/scripts/build_saved.py` from the committed fixtures, with SPY's
bars and high/low filled from Yahoo Finance and labeled). It covers BX, AAPL, NVDA, JPM, AMZN and SPY, priced at
the close on Sep 25, 2026, and shows a SAVED DATA banner. Screenshots and your own holdings need the full app.

## Run it

```bash
cd backend
cp ../.env.example .env        # fill in keys as sources get connected
uv sync
uv run python scripts/seed_sample.py
uv run uvicorn stone.api.main:app --reload --port 8000
uv run pytest
uv run python scripts/check_gemini.py   # once GEMINI_API_KEY is set: reads the demo screenshot, checks it adds up
```

```bash
cd frontend
npm install
npm run dev                    # http://localhost:3000, proxies /api to :8000
```

## Libraries we use

Everything else in this repo was written at the event.

| Library | License | Used for |
|---|---|---|
| FastAPI | MIT | HTTP API |
| Uvicorn | BSD-3 | API server |
| psycopg 3 | LGPL-3 | Postgres driver |
| httpx | BSD-3 | HTTP client for outside APIs |
| python-dotenv | BSD-3 | Reading `.env` |
| pytest | MIT | Tests |
| Pillow | MIT-CMU | Drawing the demo screenshot (`scripts/make_demo_screenshot.py`, one-off) |
| QuantStats | Apache-2.0 | Risk card: volatility, max drawdown, beta, Sharpe, worst day |
| pandas, NumPy, SciPy | BSD-3 | Used by QuantStats; SciPy also checks the engine's binomial tail in tests |
| statsmodels | BSD-3 | Tests only: the engine's Wilson range and Benjamini-Hochberg must match it |
| yfinance | Apache-2.0 | `scripts/build_saved.py` only: SPY's daily bars and the stocks' high/low for the live demo (labeled Yahoo Finance) |
| TradingView Lightweight Charts | Apache-2.0 | Pro candles on the company page (keeps TradingView's attribution logo) |
| d3-hierarchy | ISC | The "What you really own" treemap layout |
| driver.js | MIT | The guided tour |

## Data sources

| Source | Key | Limit | Used for |
|---|---|---|---|
| SEC EDGAR (submissions, companyfacts, Form 4) | none, contact email in User-Agent | 10 req/s (we use 8) | Filings, financials, insider sales |
| Alpaca Market Data (IEX feed) | free paper-account key | 25 symbols per request | 2 years of daily prices (split-adjusted) |
| FRED | free key | generous | 10-year Treasury yield (DGS10) |
| State Street (SSGA) daily SPY holdings file | none | one file a day, cached | What SPY holds, for looking through the fund (shown with its "as of" date) |
| Google Gemini API (`gemini-3.8-flash`, set by `GEMINI_MODEL`) | free AI Studio key | free-tier quota, cached per image and filing | Reading holdings off a screenshot (checked against its printed total); plain filing summaries (every figure checked against the filing's XBRL) |

## Research used

- Boudoukh, Feldman, Kogan & Richardson, "Which News Moves Stock Prices? A Textual Analysis",
  NBER w18725, Table 3 (news-type weights).
- Wilson (1927), "Probable Inference, the Law of Succession, and Statistical Inference", JASA 22:209
  (the 90% range for a hit rate).
- Newcombe (1998), "Interval estimation for the difference between independent proportions",
  Statistics in Medicine 17:873, method 10 (the stricter test shown in Pro).
- Benjamini & Hochberg (1995), "Controlling the False Discovery Rate", JRSS B 57:289 (the scan's 10% FDR count).
