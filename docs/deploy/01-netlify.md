# A. Put the demo site on Netlify

Ten minutes, no keys, no backend. The repo already contains everything Netlify needs
(`netlify.toml` at the root and the saved data under `frontend/public/saved/`).

## 1. Import the repo

1. Sign in at https://app.netlify.com (GitHub login is simplest).
2. **Add new site → Import an existing project → GitHub.**
3. Authorize the Netlify GitHub app for the **I0B0M** organization and pick **I0B0M/Stone**.
   If the repo isn't listed, click "Configure the Netlify app on GitHub" and grant it access to
   that repository.
4. Netlify reads `netlify.toml` and pre-fills the settings. Check they match; don't change them:

   | Setting | Value (from `netlify.toml`) |
   |---|---|
   | Branch to deploy | `main` |
   | Base directory | `frontend` |
   | Build command | `npm run build` |
   | Publish directory | `.next` |
   | Environment | `NEXT_PUBLIC_STONE_SAVED=1`, `NODE_VERSION=22` |

   Netlify detects Next.js and adds its Next.js runtime on its own; nothing to install.
5. Optional: set the site name now (Site configuration → Site details → Change site name),
   e.g. `stone-shellhacks`, so the URL is `https://stone-shellhacks.netlify.app`.
6. **Deploy.** The first build takes 3–5 minutes (it installs `frontend/node_modules`).

## 2. Check the site

Open these on the deployed URL and confirm each one:

| Page | What you should see |
|---|---|
| `/` | The board with the example portfolio (BX, AAPL, NVDA, JPM, AMZN, SPY), a SAVED DATA banner, the tour on the first visit |
| `/briefing` | The orb, "16 things to say", Play works, captions light up word by word |
| `/company/BX` | Price chart, filings, signals; Pro (tap the O) shows candles and the working |
| `/lab?t=BX&s=rate_jump` | 15 cases, NOT PROVEN |
| `/import` | Says the live demo runs on saved data (screenshots need the full app) |

Open the browser console on `/briefing`: it must be empty of errors.

## 3. What not to set

- Do **not** add `STONE_API_URL` or change `NEXT_PUBLIC_STONE_SAVED` on the production site. Saved
  mode is the whole point: the site never waits for a server.
- `GEMINI_API_KEY` is not needed for the demo site; saved mode never calls Gemini.

## 4. After that

- Every push to `main` redeploys automatically. Pull requests get a deploy preview URL.
- If a build fails after a dependency change, use **Deploys → Trigger deploy → Clear cache and deploy site**.
- To refresh the saved numbers, run `backend/scripts/build_saved.py` locally (guide B, step 7)
  and push the result; the site rebuilds itself.
- The `live` branch (guide C) is a separate deploy of the same site that talks to a real backend.
  Enable it under **Site configuration → Build & deploy → Branch deploys → Let me add individual
  branches → `live`**. Leave production alone.

## If something is off

| Symptom | Cause and fix |
|---|---|
| Build fails with a Node error | `NODE_VERSION=22` comes from `netlify.toml`; check the build log's first lines say Node 22. If you edited the file, restore it. |
| Every route but `/` is 404 | The Next.js runtime didn't run. The build log should mention `@netlify/plugin-nextjs`; if not, the base directory is wrong (must be `frontend`). |
| Pages load but show "Can't reach Stone's data" | `NEXT_PUBLIC_STONE_SAVED` isn't `1` for this deploy. Check the environment variables for the production context. |
| `/briefing` speaks with the browser's voice, not the recorded one | `frontend/public/saved/voice/` is missing from the deploy; make sure it's committed (guide B, step 8). |
