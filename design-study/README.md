# Design study and restyle

A pass over four Stone pages, using a top consumer investing app's **public, logged-out** product pages
as a reference for patterns. We took measurements only. The measured patterns are in
[`robinhood-patterns.md`](robinhood-patterns.md), and the tokens we ended up with are in
[`stone-tokens.json`](stone-tokens.json).

## Patterns borrowed (measured → Stone)

| Pattern | Measured on the reference | Where it is in Stone |
|---|---|---|
| Chart-first header | title 32/40, price directly under it, change 13–15px in the direction colour | Company: `.sc-title h1` 32/40, `.sc-price` 40/48 Bricolage 700, `.sc-change` 15/24 |
| Bare chart | one 2px line, no grid, one dotted baseline | `StockChart`: 2px line in up/down, dotted start-of-range baseline, y labels only in Pro |
| Range tabs under the chart | 13px/700, tracked 2px, underline for the active tab, hairline under the row | `.sc-ranges`: 1W 1M 3M 1Y 2Y over the API's 528 daily closes, blue underline, 44px targets |
| Quiet list rows | about 44px, text only, no icons | Board `.hrow`: at least 64px, ticker/name, 30-day sparkline, value + move, badge; hairlines |
| Pill controls, 44px | chips 44px, radius 40–44 | signal chips, ticket CTA (48px, radius 999px) |
| One primary action | one filled button per view | Practice: one blue button per step (Review → Place) |
| Ticket: label left, value right, total under a hairline | order type, shares, price, fees, then the estimated total | Practice `.t-row` / `.t-sum`, then a receipt step |
| Hairlines, not shadows | 0 box-shadows on the stock page | new components use 1px `--sep` hairlines only |
| Short, plain motion | `color 0.3s`, `opacity/transform 0.3s`, `border-color 0.2s` | 200ms colour, 300ms reveals, `--ease-out`; all off under `prefers-reduced-motion` |

## What stayed Stone

- The ST◯NE logo with the O as the Lite/Pro switch; blue `#2563EB` accent; white paper, black ink; Pro in dark.
- Bricolage Grotesque for titles and big numbers, Figtree for body, Doto only for small uppercase label lines (`.kicker`, card titles).
- Stone's features and words: Calm / Heads up / Not tested, "Does it matter?" with the filled dots and the 90% range bar,
  Lite vs Pro, fund look-through (fund rows link to `/fund/[symbol]`), the yellow practice banner, and a source plus an as-of date on every number.
- Things only Stone has: **marks under the chart line** at every past case of the chosen signal (filled = came true), so the chart shows where the
  "Does it matter?" dots come from; and the **reveal**, where the dots fill 60ms apart, the hit rate counts up in step with them, then normal
  and the range fade in, then a verdict strip.

## No assets lifted

No logo, icon, illustration, font file, image or copy was downloaded, hotlinked or reproduced. The reference's
typefaces and brand colours are not used. Its greens were not used as a brand colour; Stone's up/down colours are its own
(`#1a7f37` / `#d70015`) and only mean direction. Reference screenshots were kept outside the repo, as a local reference only.
The study used headless Chromium on public, logged-out pages. It did not log in, click anything or submit any form.

## Data honesty

Every number on these pages comes from the API (`frontend/src/lib/api.ts` types). A few are worked out from those numbers,
and each one says what it is:
- the range change is last close ÷ first close in the chosen range;
- the board's "today" move is the sum of each row's value × its own 1-day change, shown only when every row has a change;
- the practice ticket's estimated cost is shares × the close.

## Checks (2026-09-26)

| Check | Result |
|---|---|
| `PW_DIR=<folder with playwright> node scripts/check-styles.mjs` (4 pages × 390/768/1280, Pro palette, reduced motion) | **184 passed, 0 failed** |
| Saw it fail: dot stagger mutated to 45ms | 3 failed (one per width), restored → 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | exit 0 |
| No horizontal scroll at 390 / 768 / 1280 | asserted in the script, all pages, Lite and Pro company |
| Tap targets ≥ 44px at 390 | asserted in the script on buttons, selects, inputs, tabs, radios, `.btn`, `.linkb` in `main` |

The script runs against `http://localhost:3001` by default (the shared dev server). Next.js allows only one dev server per folder.
