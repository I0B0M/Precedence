## What changed

<!-- What's different for the user, in plain words. -->

## Why

<!-- Link the issue ("Closes #12") or say what prompted it. -->

## How I checked it

<!-- The commands you ran and what they printed. For UI changes: Lite and Pro screenshots, phone and desktop. -->

## Checklist

- [ ] Backend: `uv run pytest` passes
- [ ] Engine or briefing changed: `bash scripts/mutation_check.sh` says "killed" on every line
- [ ] Frontend: `npm run lint`, `npm test` and `npm run build` pass
- [ ] Every new number on screen shows its source and as-of date
- [ ] New terms are in `CONTEXT.md`; a decision others must follow has an ADR in `docs/adr/`
- [ ] No keys, `.env` values or personal data in the diff
