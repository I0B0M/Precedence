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

## Run it

```bash
cd backend
cp ../.env.example .env        # fill in keys as sources get connected
uv sync
uv run python scripts/seed_sample.py
uv run uvicorn stone.api.main:app --reload --port 8000
uv run pytest
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

## Data sources

| Source | Key | Limit | Used for |
|---|---|---|---|
| SEC EDGAR (submissions, companyfacts, Form 4) | none, contact email in User-Agent | 10 req/s (we use 8) | Filings, financials, insider sales |
| Alpaca Market Data (IEX feed) | free paper-account key | 25 symbols per request | 2 years of daily prices (split-adjusted) |
| FRED | free key | generous | 10-year Treasury yield (DGS10) |
| State Street (SSGA) daily SPY holdings file | none | one file a day, cached | What SPY holds, for looking through the fund (shown with its "as of" date) |

## Research used

- Boudoukh, Feldman, Kogan & Richardson, "Which News Moves Stock Prices? A Textual Analysis",
  NBER w18725, Table 3 (news-type weights).
