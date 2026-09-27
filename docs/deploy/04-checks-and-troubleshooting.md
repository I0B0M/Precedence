# Checks and troubleshooting

## The checklist before any push to `main`

Run from the repo root; every line must pass.

```bash
cd backend && uv run pytest -q && bash scripts/mutation_check.sh && cd ..
cd frontend && npx tsc --noEmit && npm run lint && npm test && npm run build && cd ..
cd frontend && NEXT_PUBLIC_STONE_SAVED=1 npm run build && cd ..     # what Netlify runs
```

Then open the saved-mode dev server (`NEXT_PUBLIC_STONE_SAVED=1 npm run dev -- --port 3003`) and
walk `/`, `/briefing`, `/company/BX`, `/lab`, `/import`, `/practice` with the console open.

## What each health check should say

| Check | Command | Good answer |
|---|---|---|
| Postgres | `pg_isready` | `accepting connections` |
| Database has data | `psql stone -c "select source, count(*) from companies group by 1"` | `sec` rows (real) or `sample` rows |
| Backend | `curl -s localhost:8000/api/status` | `{"data":"real"...}` or `"sample"`; `"empty"` means nothing loaded |
| Signals | `curl -s localhost:8000/api/lab/BX/rate_jump \| jq .label` | `"NOT PROVEN"` on real data |
| Briefing | `curl -s -X POST localhost:8000/api/briefing/portfolio -H 'content-type: application/json' -d '{"holdings":[{"symbol":"BX","shares":10}]}' \| jq '.lines \| length'` | a number over 5 |
| Frontend proxy | `curl -s localhost:3000/api/status` | same JSON as the backend |
| Netlify production | `curl -s https://YOUR-SITE.netlify.app/saved/status.json` | JSON |
| Netlify `live` | `curl -s https://live--YOUR-SITE.netlify.app/api/status` | JSON from your machine |
| Ollama | `curl -s localhost:11434/api/tags` | your model listed |
| Tunnel | `curl -s https://stone-api.YOURDOMAIN.com/api/status` | JSON; 530 means the tunnel isn't running |

## Problems and fixes

| Symptom | Fix |
|---|---|
| `uv sync` says "No space left on device" | `df -h /`; free disk (`uv cache prune`, delete old `node_modules`/`.venv`, `docker system prune`). Stone needs ~6 GB. |
| `uv run pytest` fails to connect | `createdb stone_test`; Postgres must be running (`brew services start postgresql@16`). |
| `ingest_all.py` skips sources | The key is missing from `backend/.env`; the message names the variable. Sources without a key are skipped, not failed. |
| `ingest_all.py` gets HTTP 403 from the SEC | `SEC_USER_AGENT` must contain a real contact email. |
| `/api/status` says `"empty"` | Run `seed_sample.py` or `ingest_all.py`. |
| The board is empty on real data | Expected: there is no default portfolio. Add holdings on the Portfolio page or open the example. |
| `/api/filings/.../summary` returns 503 | No `GEMINI_API_KEY` and no `STONE_SUMMARY_MODEL`. Set one of them. |
| Summaries time out with Ollama | The model is loading (first call) or the filing is long. Try again; use a 3B model, not 7B, on a laptop. |
| `read_filings.py` says transformers isn't installed | `cd backend && uv pip install transformers torch`. |
| `news_tone` isn't in `/api/lab/signals` | `STONE_READERS=1` in `backend/.env`, then restart uvicorn. |
| Frontend shows "Can't reach Stone's data" locally | The backend isn't on port 8000, or `STONE_API_URL` points elsewhere. |
| Netlify build fails on `npm ci` | `frontend/package-lock.json` is out of step with `package.json`; run `npm install` locally and commit the lock file. |
| Netlify `live` shows HTML instead of JSON for `/api/status` | The tunnel (ngrok free) is serving an interstitial page; use Cloudflare Tunnel. |
| `/briefing` uses the browser's voice for some lines | Those lines have no recording yet; run `uv run backend/scripts/build_voice.py` and commit `frontend/public/saved/voice/`. |
| Push to `main` rejected (non fast-forward) | Someone pushed first: `git fetch origin && git rebase origin/main`, re-run the checklist, push again. |
