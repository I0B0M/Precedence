# Contributing to Precedence

Thanks for helping. This guide covers setup, the checks every change must pass, and the few rules that keep
Precedence's numbers honest. If anything here is unclear, open an issue and ask.

## Ground rules

1. **Every number needs a source and an as-of date.** If the UI shows a number, the API response it came from says
   where it came from and when.
2. **Only the engine assigns labels.** Signals are tested on each holding's own history in
   `backend/stone/signals/engine.py`. A trained model may propose cases, never a label or a state
   ([ADR 0002](docs/adr/0002-readers-propose-the-engine-tests.md)). The briefing is written by rules, and every
   number in a line must round-trip to its evidence ([ADR 0001](docs/adr/0001-briefing-is-rules-not-a-language-model.md)).
3. **No prediction claims.** Precedence says whether a kind of news has mattered before. It never forecasts a price,
   and when the evidence is thin it says "not proven".
4. **A test you haven't watched fail doesn't count.** If you change the engine, run the mutation check (below).
5. **Use the glossary.** The words in [`CONTEXT.md`](CONTEXT.md) (Holding, Signal, Case, Hit, Label, State, ...) mean
   one thing each. Use them in code, UI copy, issues and pull requests, and add a term there before inventing a new
   one.
6. **Never commit secrets.** `backend/.env` is gitignored. Refer to keys by variable name only, in code, logs and
   pull requests.
7. **Respect each source's terms.** SEC asks for a contact email in the User-Agent and at most 10 requests a second
   (the client uses 8). Keep the FRED notice in the footer, TradingView's attribution logo on the candles, and the
   OpenStreetMap credit on the map.

## Setting up

Follow the [quick start in the README](README.md#quick-start), or the longer
[run-it-locally guide](docs/deploy/02-run-locally.md). The short version:

- **Frontend only:** `cd frontend && npm install && NEXT_PUBLIC_STONE_SAVED=1 npm run dev` runs the app on saved
  data, with no database and no keys.
- **Full app:** Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 22 and PostgreSQL 16. Create the `stone`
  and `stone_test` databases, `uv sync` in `backend/`, seed the fictional sample data, and run the API and the
  frontend side by side.

## Before you open a pull request

Run the checks for what you touched. CI runs the same ones.

**Backend** (from `backend/`, with a `stone_test` database):

```bash
uv run pytest
bash scripts/mutation_check.sh   # if you changed stone/signals/engine.py or the briefing: every line must say "killed"
```

**Frontend** (from `frontend/`):

```bash
npm run lint
npm test
npm run build                    # also type-checks
```

**UI changes:** check Lite and Pro, a phone width (390 px) and a desktop width, and saved-data mode
(`NEXT_PUBLIC_STONE_SAVED=1`). `scripts/check-styles.mjs` checks the restyled pages of a running app against
`design-study/stone-tokens.json`. It needs Playwright installed somewhere (see the file's header) and real data for
BX, AMZN, SPY and QQQ.

## Where things go

### Adding a data source

- Add `backend/stone/sources/<name>.py`, split into **fetch** (HTTP through `stone/fetch.py`, which rate-limits and
  caches every raw response under `data/cache/<source>/`) and **parse** (pure functions).
- Add a small sample response to `backend/tests/fixtures/` and parser tests next to the others. Say in
  `tests/fixtures/README.md` whether the file is hand-written or a real public file saved unchanged.
- Give every row a `source`, and write with upserts so a re-run is safe.
- Add the source to the Data sources table in the README.

### Adding a signal

- A signal is a definition in `engine.py`: its source, threshold, timing, horizon and hit rule. Add it with tests
  in `tests/test_engine.py`, and add lines to `scripts/mutation_check.sh` that break its rules.
- Don't change the label rules (WEAK, STRONG, NOT PROVEN, NO DATA) without an ADR.
- Re-run `scripts/scan_signals.py` on real data and put the scan's numbers in the pull request.

### Changing the saved demo data

`frontend/public/saved/` is generated, so don't edit it by hand. It's built from `frontend/fixtures/` (exported
from a real database by `scripts/export_fixtures.py`, which refuses to run while sample rows exist) by
`scripts/build_saved.py`, `scripts/build_briefings.py` and `scripts/saved_strict.py`.

### Recording a decision

When a choice constrains future work, write a short ADR in `docs/adr/` (`NNNN-what-we-decided.md`): the decision,
what was rejected and why, and the consequences. The existing two show the length.

## Branches, commits and pull requests

- Branch from `main` and keep branches short-lived. Name them by topic, such as `briefing-voice` or
  `fix-fund-total`.
- Write the commit subject as what changed for the user, in plain words, for example "Briefing rounds half up like
  the pages". Use the body for why, and for how you checked it.
- Keep each pull request to one topic, and fill in the template: what changed, why, and how you verified it.
  Include Lite and Pro screenshots for UI changes.
- `main` stays releasable, so CI must pass before a merge.

## Reporting bugs and wrong numbers

Use the [issue templates](https://github.com/I0B0M/Stone/issues/new/choose). A number that looks wrong is a bug:
tell us the page, the number, and where you checked it. Report security problems privately, as described in
[SECURITY.md](.github/SECURITY.md), not in a public issue.

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
