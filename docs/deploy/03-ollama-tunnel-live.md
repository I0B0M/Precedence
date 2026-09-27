# C. Local models, the tunnel, and the `live` branch

Do guide B first. This adds three things, each independent:

1. **Ollama** writes filing summaries on your machine instead of Gemini.
2. **FinBERT** reads 8-K text and proposes a fourth signal, "a filing read as bad news".
3. **A tunnel** lets a second Netlify deploy (branch `live`) use your backend, so anyone can open
   the full app while your machine is on.

Read `docs/adr/0002-readers-propose-the-engine-tests.md` first: a model only proposes; the
engine decides. Nothing here changes a label on the production site.

## 1. Ollama for filing summaries

```bash
brew install ollama            # or the app from https://ollama.com (it runs the server for you)
ollama serve &                 # not needed if the Ollama app is running
ollama pull qwen2.5:3b         # about 2 GB; llama3.2:3b also works
curl -s localhost:11434/api/tags | head -c 200     # lists the model
```

In `backend/.env`:
```
STONE_SUMMARY_MODEL=ollama:qwen2.5:3b
OLLAMA_URL=http://127.0.0.1:11434
```
Restart uvicorn. Then take any 10-Q or 8-K accession from `curl -s localhost:8000/api/companies/BX | jq '.filings[0]'`
and call `curl -s localhost:8000/api/filings/<accession>/summary`. Expect 20–90 seconds the first
time on a laptop (Apple Silicon uses the GPU; Intel is slower). The response's `model` field says
which model wrote it, and `figures` shows every number checked against the filing's XBRL. Leave
`STONE_SUMMARY_MODEL` empty to go back to Gemini.

## 2. FinBERT: the "bad news" Reader

```bash
cd backend
uv pip install transformers torch                 # about 2 GB, into backend/.venv
uv run python scripts/read_filings.py BX AMZN --limit 40   # downloads ProsusAI/finbert (~440 MB) once
```
It records a tone (negative, neutral, positive) per 8-K into the `readings` table. Then in
`backend/.env` set `STONE_READERS=1` and restart uvicorn:

- `curl -s localhost:8000/api/lab/signals` now lists `news_tone`.
- `http://localhost:3000/lab?t=BX&s=news_tone` shows its cases and verdict.
- A stock you haven't run `read_filings.py` for shows NO DATA, never Calm.

Check the false-alarm rate before believing any STRONG from it:
```bash
uv run python scripts/calibration_check.py
```
Keep `STONE_READERS=0` (the default) for anything you demo until that number is at or under 5%.

## 3. The tunnel and the `live` branch

In plain terms: Netlify hosts the site, your Mac hosts the brain (backend, database, Ollama,
FinBERT), and the tunnel is the wire between them. The Netlify frontend only ever talks to one
backend origin, `STONE_API_URL`, which the Next.js server on Netlify proxies `/api/*` to. So the
tunnel goes in front of **FastAPI on port 8000**, never in front of Ollama.

### The one-command way

```bash
bash scripts/live-backend.sh
```

It starts the backend, opens a Cloudflare **quick tunnel** (no account, no domain) and prints the
`https://….trycloudflare.com` URL plus the two Netlify steps below. Ctrl-C stops both. A quick
tunnel gets a new URL every run, and the URL is baked into the deploy at build time, so each new URL
means: paste it into the `live` branch's `STONE_API_URL` and trigger a deploy of `live` (3–4 minutes).
Fine for a demo day; for something that stays up, use a named tunnel (next section) and run the
script with `STONE_TUNNEL=stone`.

### Cloudflare Tunnel with your own hostname (stable URL, free)

You need a domain on Cloudflare (free plan; a $10 domain is fine).

```bash
brew install cloudflared
cloudflared tunnel login                     # opens the browser, pick the domain
cloudflared tunnel create stone              # prints the tunnel id and writes ~/.cloudflared/<id>.json
cloudflared tunnel route dns stone stone-api.YOURDOMAIN.com
```

Write `~/.cloudflared/config.yml`:
```yaml
tunnel: stone
credentials-file: /Users/YOU/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: stone-api.YOURDOMAIN.com
    service: http://localhost:8000
  - service: http_status:404
```

Run it whenever the backend should be reachable:
```bash
uv run uvicorn stone.api.main:app --port 8000      # terminal 1, from backend/
cloudflared tunnel run stone                        # terminal 2
curl -s https://stone-api.YOURDOMAIN.com/api/status # from anywhere
```

Protect it before you share the URL. In the Cloudflare dashboard, **Security → WAF → Rate
limiting rules**: limit `stone-api.YOURDOMAIN.com` to about 60 requests a minute per IP. The API
is read-only apart from screenshot reading (your Gemini quota) and summaries (your CPU), so a rate
limit is the right guard; Cloudflare Access with a service token would block the Netlify proxy,
which can't add headers. Stop the tunnel when you're done (Ctrl-C); the URL then answers 530.

### ngrok (quicker, less stable)

`brew install ngrok`, sign in, claim your free static domain in the ngrok dashboard, then
`ngrok http 8000 --domain YOURNAME.ngrok-free.app`. Free-tier requests from browsers get an
interstitial page; the Netlify proxy usually passes, but if `/api/status` through Netlify shows
HTML instead of JSON, use Cloudflare.

### The `live` branch on Netlify

```bash
git checkout -b live main
git push -u origin live
```

In Netlify:
1. **Site configuration → Build & deploy → Branch deploys → Let me add individual branches → `live`.**
2. **Site configuration → Environment variables → Add a variable → `STONE_API_URL`**, value
   `https://stone-api.YOURDOMAIN.com` (or the quick tunnel's `https://….trycloudflare.com`), and
   under *Scopes / Deploy contexts* choose **Branch: `live`** only. Production must not get it.
3. `netlify.toml` already sets `NEXT_PUBLIC_STONE_SAVED=0` for the `live` context, so this deploy
   uses the backend for everything.
4. Push to `live` (or Deploys → Trigger deploy for the branch). The URL is
   `https://live--YOUR-SITE.netlify.app`.

Check `https://live--YOUR-SITE.netlify.app/api/status` returns JSON from your machine, then open
`/` and add holdings; they come from your database now. When your machine is off, this deploy shows
"Can't reach Stone's data"; production is unaffected.

Keep `live` up to date with `git checkout live && git merge main && git push`.
