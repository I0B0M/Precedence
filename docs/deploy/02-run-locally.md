# B. Run the full app on your machine

This gives you the real thing: Postgres with real SEC, Alpaca and FRED data, the FastAPI
backend, the Next.js frontend, the tests, and the scripts that rebuild the saved demo data and
the narrator's voice. Written for macOS with Homebrew; Linux is the same minus `brew`.

You need about 6 GB of free disk (Postgres data, `node_modules`, the Python venv, and the
SEC/Alpaca cache). Check with `df -h /` first.

## 1. Tools

```bash
brew install postgresql@16 uv node@22 ffmpeg
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

- `uv` manages Python (it installs 3.12 itself) and the backend's packages.
- Node 22 is what Netlify uses; 20 or 24 also work.
- `ffmpeg` is only for recording the voice (step 8).

## 2. Clone and configure

```bash
git clone https://github.com/I0B0M/Stone.git
cd Stone
cp .env.example backend/.env
```

Edit `backend/.env`. Every key is optional except the first two for real data:

| Variable | Get it from | Needed for |
|---|---|---|
| `DATABASE_URL` | keep `postgresql://localhost:5432/stone` | everything |
| `SEC_USER_AGENT` | your name and email, e.g. `Stone ShellHacks you@example.com` (the SEC requires a contact) | filings, XBRL, Form 4s, filing text |
| `FRED_API_KEY` | free at https://fred.stlouisfed.org/docs/api/api_key.html | the 10-year yield (rate-jump signal) |
| `ALPACA_API_KEY`, `ALPACA_API_SECRET` | free paper account at https://alpaca.markets (Paper trading → API keys) | daily prices |
| `GEMINI_API_KEY` | free at https://aistudio.google.com | screenshot import, filing summaries (unless you use Ollama, guide C) |
| `STONE_READERS`, `STONE_SUMMARY_MODEL`, `OLLAMA_URL` | leave as they are | guide C |

Never commit `backend/.env`; it is gitignored.

## 3. Database

```bash
createdb stone        # the app
createdb stone_test   # the tests (fixtures only, wiped by pytest)
```

The schema is created by the first script that runs (`seed_sample.py` or `ingest_all.py`),
from `backend/stone/schema.sql`.

## 4. Backend

```bash
cd backend
uv sync                       # creates backend/.venv with every dependency
uv run pytest -q              # 400+ tests against stone_test; all must pass
```

Then pick your data:

**Fictional sample data (30 seconds, no keys):**
```bash
uv run python scripts/seed_sample.py
```
The UI shows a SAMPLE DATA banner while any sample rows exist. Remove them with `--clear`.

**Real data (about 35 minutes cold, needs `SEC_USER_AGENT`, `FRED_API_KEY`, the Alpaca keys):**
```bash
uv run python scripts/ingest_all.py            # S&P 100: filings, XBRL, Form 4s, prices, DGS10
uv run python scripts/ingest_etfs.py           # SPY's holdings from State Street
uv run python scripts/scan_signals.py          # tests every stock, records the scan
```
Everything is cached under `backend/data/cache/`, so re-running only fetches what's missing,
and `--offline` rebuilds from the cache alone. `--only BX,AAPL` limits the tickers.

**Or restore a teammate's database (fastest, identical numbers):** on the machine that has it,
`pg_dump -Fc stone > stone.dump`; on yours, `pg_restore -d stone --no-owner stone.dump`.

Start the API:
```bash
uv run uvicorn stone.api.main:app --reload --port 8000
curl -s localhost:8000/api/status      # {"data":"real",...} or "sample"
```

## 5. Frontend

In a second terminal:
```bash
cd frontend
npm install
npm run dev                            # http://localhost:3000
```
The dev server proxies `/api/*` to `http://localhost:8000` (change with `STONE_API_URL`).

Frontend checks, all of which must be clean before a push:
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

## 6. Saved mode on your machine

This is exactly what Netlify runs. No backend needed:
```bash
NEXT_PUBLIC_STONE_SAVED=1 npm run dev -- --port 3003    # http://localhost:3003
```
Use it to check a change to the demo site before pushing.

## 7. Rebuilding the saved data

`frontend/public/saved/` is built from the committed fixtures in `frontend/fixtures/` (real API
responses exported from the real database) plus SPY bars and daily highs/lows from Yahoo Finance:
```bash
cd backend
uv run python scripts/export_fixtures.py BX AAPL NVDA JPM AMZN   # only with the real database
uv run python scripts/build_saved.py                              # writes frontend/public/saved, then the briefings
```
`build_saved.py` also writes the briefing scripts (`stone/briefing/saved.py`). If you edit saved
files by hand, run `uv run python scripts/build_briefings.py` and `uv run python scripts/saved_strict.py`
afterwards. Commit the result and Netlify rebuilds.

## 8. Recording the narrator's voice

The Briefing tab plays recordings of each line (Kokoro-82M, an open-weight speech model) and
falls back to the browser's voice for lines without one. After changing the saved briefings:
```bash
cd ..                                   # repo root
uv run backend/scripts/build_voice.py   # downloads the model the first time (~300 MB); needs ffmpeg
```
It writes `frontend/public/saved/voice/*.mp3` and `index.json`. Commit them.

## 9. The engine's own checks

```bash
cd backend
bash scripts/mutation_check.sh                    # every mutant of the engine must be killed
uv run python scripts/calibration_check.py --quick   # false-STRONG rate on no-effect stocks
```
