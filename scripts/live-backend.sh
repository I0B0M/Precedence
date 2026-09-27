#!/usr/bin/env bash
# Run Stone's backend on this Mac and open a tunnel to it, so the `live` Netlify deploy can use it
# (docs/deploy/03-ollama-tunnel-live.md). One terminal, Ctrl-C stops both.
#
#   bash scripts/live-backend.sh                 # quick tunnel: a random *.trycloudflare.com URL, no account
#   STONE_TUNNEL=stone bash scripts/live-backend.sh   # your named Cloudflare tunnel (stable hostname)
#
# Needs: uv (backend/.venv via `uv sync`), Postgres running with data, and cloudflared (`brew install cloudflared`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${STONE_PORT:-8000}"
LOG="${TMPDIR:-/tmp}/stone-tunnel.log"

command -v uv >/dev/null || { echo "uv is not installed: brew install uv"; exit 1; }
command -v cloudflared >/dev/null || { echo "cloudflared is not installed: brew install cloudflared"; exit 1; }
[ -f "$ROOT/backend/.env" ] || { echo "backend/.env is missing: cp .env.example backend/.env and fill it in"; exit 1; }

cleanup() { echo; echo "stopping"; kill "${API_PID:-}" "${TUN_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "== backend on port $PORT"
(cd "$ROOT/backend" && uv run uvicorn stone.api.main:app --host 127.0.0.1 --port "$PORT") &
API_PID=$!
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1 && break
  sleep 0.5
done
STATUS="$(curl -sf "http://127.0.0.1:$PORT/api/status" || true)"
[ -n "$STATUS" ] || { echo "the backend didn't start; see the lines above (is Postgres running? is DATABASE_URL right?)"; exit 1; }
echo "   /api/status: $STATUS"

echo "== tunnel"
: > "$LOG"
if [ -n "${STONE_TUNNEL:-}" ]; then
  cloudflared tunnel run "$STONE_TUNNEL" >"$LOG" 2>&1 &
  TUN_PID=$!
  sleep 3
  echo "   named tunnel '$STONE_TUNNEL' is up; its hostname is the one you routed with 'cloudflared tunnel route dns'"
  URL="(your named tunnel's hostname)"
else
  cloudflared tunnel --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
  TUN_PID=$!
  URL=""
  for _ in $(seq 1 60); do
    URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)"
    [ -n "$URL" ] && break
    sleep 0.5
  done
  [ -n "$URL" ] || { echo "no tunnel URL after 30 s; see $LOG"; exit 1; }
  echo "   $URL"
  echo "   (a quick tunnel gets a new URL every run; a named tunnel keeps one)"
fi

cat <<MSG

== next, in Netlify (once per URL)
   Site configuration -> Environment variables -> STONE_API_URL = $URL   (scope: branch 'live')
   Deploys -> 'live' -> Trigger deploy.  The rewrite is fixed at build time, so a new URL needs a new deploy.
   Then check: https://live--YOUR-SITE.netlify.app/api/status

Leave this terminal open. Ctrl-C stops the backend and the tunnel.
MSG
wait "$API_PID"
