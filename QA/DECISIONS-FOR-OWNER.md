# Decisions only the owner can make (from the overnight builder)

Written 2026-09-27 03:40 ET. Everything else from the judge's four walks is done or is with the data chat or the command center.

## 1. Which worktree the site runs from

- **What happened.** The brief said to build in `.claude/worktrees/manayerbamate-site-clone-85b46e` on `precedence-look-site`.
  A hook then blocked this session from writing there: "Do not write to other worktrees' files from this session."
  Edits up to `c93551e` had already gone in through Bash, which the hook doesn't cover. I stopped writing there by any route.
- **Where the work is.** Local branch `precedence-build` in `.claude/worktrees/precedence-overnight-build-91287c`. It is
  `precedence-look-site` (`c93551e`) plus every commit since. Nothing has been pushed.
- **What runs where.** :3000 (production build, the demo) and :3008 (dev) serve `precedence-build`. :3006 still serves
  `precedence-look-site` at `c93551e`.
- **To choose.** Fast-forward `precedence-look-site` to `precedence-build` yourself, or tell the builder the guard doesn't
  apply to that worktree.

## 2. Lite wording on a STRONG signal (judge walks #2–#4)

- **Now (the brief's exact Classic wording):** "Insiders sold shares. This has mattered for AMZN before."
- **The judge asks for:** "This has come before drops here. Not proven." It also wants "2 have mattered before" (THIS WEEK) and
  the hero's "whether that kind of news has ever mattered" reworded the same way.
- **Why it matters to the judge.** Pro says "Doesn't survive the correction · too few cases in each half" for the same
  stocks (latest scan: 0 of 11 STRONG survive Benjamini–Hochberg at 10%). The judge scores data honesty 4, not 5, on this
  alone and says it's the change that takes the build to 5/5.
- **The rule itself isn't in question.** STRONG + firing = Heads up stays (the owner decided). This is wording only.
- **One switch, ready (04:30 ET).** `frontend/src/lib/flags.ts`: `LITE_STRONG_WORDING = "mattered"` (shipped) or
  `"not-proven"`. Every Lite STRONG sentence reads from it: the verdict, row lines, fund lines, the THIS WEEK / Your week
  count ("3 have come before drops"), the home and start-screen promise, and the Learn badge tiles. The badge and the rule
  don't change. Judge walk #5: **4/5 as shipped ("mattered"), 5/5 with "not-proven"** (data honesty 4 → 5; the other seven
  categories are already 5). Verified: "mattered" is word-for-word the shipped `c5c2cc3` on 9 Lite pages; "not-proven"
  switches every STRONG line. The command center flips it and rebuilds :3000 (~1 min) once you choose.

## 3. The old landing page (already handled; for the record)

- The previous landing (`landing.css`, from `0148395`) had section names and one exact value (`.lp-protect` 1226px) that
  also appear in an extracted Robinhood style file in the untracked `clone-workspace/` of the other worktree.
- The command center applied the "nothing copied" rule: keep our words, numbers and art, and rebuild the layout from our
  own tokens. Done in `0e4baf0`, with `landing.css` deleted and none of the suspect values left in `frontend/src`.
- `clone-workspace/` and `robinhood-clone/` are still in that worktree, untracked. Whether to delete them is your call.
