# Deploying Stone: what runs where

Stone is two programs and a database:

| Part | What it is | Where it runs |
|---|---|---|
| Frontend | Next.js app (`frontend/`) | Netlify, or your machine (`npm run dev`) |
| Backend | FastAPI (`backend/`), the signal engine, Gemini/Ollama readers | Your machine (or a cloud host later) |
| Database | Postgres 16, schema in `backend/stone/schema.sql` | Your machine |

The **live demo site** on Netlify runs the frontend alone in **saved mode**: it reads real API
responses saved under `frontend/public/saved/` (built by `backend/scripts/build_saved.py`). No
backend, no database, nothing to keep alive. That is the site judges open.

Everything that needs the backend (your own holdings, screenshot import, filing summaries, the
Readers, the full S&P 100) runs locally, and can be shown on the internet through the `live`
branch plus a tunnel from your machine. In plain terms: **Netlify hosts the site, your Mac hosts
the brain, and `scripts/live-backend.sh` opens the wire between them.** Two deploys of one site:
`production` (saved data, always up) and `live` (your Mac, up while the script runs).

## Pick a path

| Path | Time | Guide |
|---|---|---|
| A. Put the demo site on Netlify | 10 minutes | [01-netlify.md](01-netlify.md) |
| B. Run the full app on your machine (real data, tests, rebuilding the saved files and the voice) | 1–2 hours the first time | [02-run-locally.md](02-run-locally.md) |
| C. Local models (Ollama, FinBERT) and the `live` branch through a tunnel | 1 hour on top of B | [03-ollama-tunnel-live.md](03-ollama-tunnel-live.md) |
| Checks after each step, and what to do when something fails | as needed | [04-checks-and-troubleshooting.md](04-checks-and-troubleshooting.md) |

Do A first; it is independent of everything else. B is needed before C.

## Rules that never change

- Never commit `backend/.env`. Keys go in `.env` locally and in Netlify's site settings, nowhere else.
- The Netlify production site stays in saved mode. It must never depend on someone's laptop.
- Don't expose Ollama's own port (11434) to the internet. Only FastAPI goes through the tunnel.
- Commits: author `Bryan <bryan2@arch-te.com>` or your own name, no AI attribution lines.
