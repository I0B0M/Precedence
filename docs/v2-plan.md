# Precedence v2: ML/AI, accuracy and deployment

Settled on 2026-09-27 (after the ShellHacks code freeze). The submission stays what is on main:
the statistics engine, the rule-based briefing panel, Gemini for reading, and the saved-data demo
on Netlify. Everything below is for after the hackathon. Vocabulary follows `CONTEXT.md`
(Expert = a tested rule; Reader = a trained model that can only propose cases) and
`docs/adr/0002-readers-propose-the-engine-tests.md`.

## What "accurate" means

Precedence does not predict prices; it says whether a kind of news has mattered before. Three numbers
go on the README as the accuracy claim, measured and reported, never asserted:

| Target | How it is measured | Number |
|---|---|---|
| Calibration | Shuffle each stock's case dates 10 times (placebo); count STRONG labels | ≤ 5% false STRONG; hold-out pass rate reported |
| Reading accuracy | 30 real brokerage screenshots from at least 3 apps, kept outside the repo, each with a printed total | ≥ 99% of rows reconcile |
| Grounding | Every printed number in a spoken line round-trips to its evidence (`lines.check`) | 100%, or the line is held back |

Not a target: whether a stock falls after a Heads up more often than a coin flip. No model can
promise that on 15 to 50 cases per stock, and claiming it would fail with the judges.

## Readers (the "small mixture of financial experts")

A Reader reads one kind of text and proposes cases; the existing gate decides what is said. First two:

1. **FinBERT tone on 8-K text** (items 2.02 and 8.01, plus the EX-99.1 press release). Case when the
   negative probability averaged over the filing's sentences is ≥ 0.70; timed at SEC acceptance;
   horizon 5 trading days; hit = the stock was lower (company news, so not judged against the
   market); overlapping filings count once. Thresholds are constants in `engine.py` next to the
   other three signals. It may show STRONG only after the placebo calibration is run and reported.
2. **A 1.5B–3B instruct summarizer** (Qwen 2.5 or Llama 3.2 through Ollama) for 8-K summaries.
   Every figure a summary prints must match the matching 10-Q/10-K XBRL fact, or the summary is
   held back.

Explicitly out: any ensemble that predicts returns; model-written phrasing of the briefing
(milestone 5 at most, and only behind the same grounding check).

## Where models run

- Batch on a developer's PC (Ollama for the summarizer) and in a nightly GitHub Action for the
  deterministic part (ingest cache → fixtures → saved JSON → briefings; FinBERT on CPU is fine
  there). Output is checked JSON committed like any other change, so the live site never depends on
  anyone's PC.
- Gemini stays the hosted reader for on-demand jobs (screenshots), key on the backend only.
- A live tunnel from a PC (Cloudflare Tunnel or ngrok) is at most a demo stretch that falls back to
  the saved script.

## Deployment

- Frontend: Netlify, two deploy contexts. `production` = saved mode, never depends on a server.
  Branch `live` = `NEXT_PUBLIC_STONE_SAVED` unset and `STONE_API_URL` pointing at the backend.
- Backend: FastAPI on DigitalOcean App Platform with the GitHub Student Pack or MLH credit;
  otherwise Render's free tier (sleeps when idle, 30 s first request, acceptable in `live` only).
- Database: Neon's free Postgres (keeps the compute credit for compute).
- Data: `pg_dump` the real `stone` database from the teammate's Mac and restore it first, so the
  demo numbers do not change; then `ingest_all.py` nightly against the cloud `DATABASE_URL`.
- Screens in `live`: board, company, Does it matter?, Briefing (the backend panel on request),
  Import (Gemini), the start screen's counts. Practice stays pretend money in the browser.
- Alpaca paper trades do not come back. "No order is ever sent from this screen" stays true on
  every screen; if paper trading ever returns it gets its own screen, footer and per-trade go.

## Non-functional requirements, in order

1. Available during judging with no server dependency (saved mode is the production site).
2. Numbers reproducible: the same data always gives the same words.
3. Holdings never leave the browser.
4. Usable in under 2 s on a phone.
5. Zero monthly cost, or within credits.
6. Degrades gracefully when the backend is down.
7. No order is ever sent.

## Milestones

1. **M1** Cloud database and the `live` Netlify context; everything on main works end to end on real data again.
2. **M2** FinBERT tone signal, placebo calibration, README numbers.
3. **M3** Summarizer with the XBRL figure check.
4. **M4** Screenshot evaluation set and its number.
5. **M5** Model phrasing of lines, if ever, behind the grounding check.

## Open facts (only the team can answer)

- Is the teammate with the real `stone` database reachable this week, for the `pg_dump`?
- Who holds `SEC_USER_AGENT`, `FRED_API_KEY`, `ALPACA_API_KEY`/`ALPACA_API_SECRET` for the nightly ingest?
- Is a GitHub Student Developer Pack or MLH DigitalOcean voucher available? If not, Render free tier.
