# Design study and restyle

A pass over four pages, with layout patterns studied from public consumer investing apps; no assets, fonts, text
or CSS were copied. The tokens we ended up with are in [`stone-tokens.json`](stone-tokens.json).

## Patterns, as built in Precedence

| Pattern | Where it is in Precedence |
|---|---|
| Chart-first header | Company: `.sc-title h1` 32/40, `.sc-price` 40/48 700, `.sc-change` 15/24 |
| Bare chart | `StockChart`: 2px line in up/down, dotted start-of-range baseline, y labels only in Pro |
| Range tabs under the chart | `.sc-ranges`: 1W 1M 3M 1Y 2Y over the API's 528 daily closes, blue underline, 44px targets |
| Quiet list rows | Board `.hrow`: at least 64px, ticker/name, 30-day sparkline, value + move, badge; hairlines |
| Pill controls, 44px | signal chips, ticket CTA (48px, radius 999px) |
| One primary action | Practice: one button per step (Review → Place) |
| Ticket: label left, value right, total under a hairline | Practice `.t-row` / `.t-sum`, then a receipt step |
| Hairlines, not shadows | new components use 1px `--sep` hairlines only |
| Short, plain motion | 200ms colour, 300ms reveals, `--ease-out`; all off under `prefers-reduced-motion` |

## What was Precedence's own (at the time of this study, Sep 26)

- The logo with its Lite/Pro switch; a blue accent; Pro in dark. (Since then: the black, gold, white and royal-blue look,
  and one castle Lite/Pro pill in the header.)
- Its features and words: Calm / Heads up / Not tested, "Does it matter?" with the filled dots and the 90% range bar,
  Lite vs Pro, fund look-through (fund rows link to `/fund/[symbol]`), the yellow practice banner, and a source plus an as-of date on every number.
- Things only Precedence has: **marks under the chart line** at every past case of the chosen signal (filled = came true), so the chart shows where the
  "Does it matter?" dots come from; and the **reveal**, where the dots fill 60ms apart, the hit rate counts up in step with them, then normal
  and the range fade in, then a verdict strip.

## No assets lifted

No logo, icon, illustration, font file, image, copy or CSS was downloaded, hotlinked or reproduced. No other app's typefaces
or brand colours are used. Precedence's up/down colours are its own and only mean direction. The study used headless Chromium
on public, logged-out pages. It did not log in, click anything or submit any form, and no screenshots are in this repo.

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
