# Pattern study — public, logged-out product pages

Measured 2026-09-26 with headless Chromium (Playwright), `getComputedStyle` only.
Pages: the public home page, the public AAPL stock page, the public SPY page.
Widths: 390, 768, 1280. No login, no forms, nothing clicked. Screenshots were kept
locally as reference and are **not** in this repo. No asset, font or copy was taken.

What we borrow is **proportions, rhythm and behaviour**. Not fonts, not colours as a
brand, not words.

| # | Pattern | Measured | Why it works | Stone version |
|---|---|---|---|---|
| 1 | **Chart-first header** | Name 32px/500, lh 40px, ls −0.33px; price directly below at the same visual size; change line 13px/700, lh 19.9px, in the up/down colour, then a plain-weight "Today" | One number owns the top of the page; the eye reads name → price → direction in under a second | Ticker + name, price in Bricolage 40px, change in semantic green/red + as-of date |
| 2 | **Chart is the hero, no chrome** | One 2px stroke, no fill, no gridlines, no y-axis; one 1px dotted baseline in grey `rgb(145,159,166)`; ≈240px tall at 1280, full column width | Removing axes lets the shape carry the story; the dotted line is the one reference you need | 2px line in up/down colour, dotted start-of-range baseline, event ticks as the only extra marks |
| 3 | **Range tabs under the chart** | 13px/700, lh 19.9px, **letter-spacing 2px**, uppercase; ~24px between labels; active = 2px ink underline; 1px hairline under the row | Text-only tabs are quiet; wide tracking makes 2-letter labels scannable; underline says "selected" without a box | 1W 1M 3M 1Y 2Y, Figtree 13/700 ls 2px, blue underline |
| 4 | **Two columns on desktop, one on phone** | Main max 1440px, 24px side padding; right rail ≈310px trade card; at 390 container max 484px, 24px gutters | Content and action are separate, action always in reach | Company: main + rail; phone stacks |
| 5 | **Section headings one step below the title** | H2 24px/500, lh 32.4px, ls −0.1px, hairline under | Three sizes do all the work: 32 / 24 / 15 | Bricolage 24 section titles with hairline |
| 6 | **Body at 15/24** | 15px/400, lh 24px, ls −0.1px; meta 13/19.9 | Generous leading keeps dense finance text readable | Figtree 15/24 body, 13/20 meta |
| 7 | **Hairlines, not boxes** | 1px borders, radius 4px on the few cards; **zero box-shadows** on the stock page at 1280 | Flat surfaces feel calm and fast; depth comes from spacing | 1px hairlines, 8px card radius, no shadows |
| 8 | **Pill controls** | Chips 44px tall, radius 40–44px, padding 8px 16px, 1px border; CTA 44px, radius 24px | 44px meets touch size; pills read as tappable | Buttons ≥44px, radius 999px |
| 9 | **One primary action per view** | One filled button in the rail; secondaries are outline pills | No decision fatigue | One filled blue button per screen |
| 10 | **Trade ticket: label left, value right** | Rows ~30px apart (order type, shares, market price, fees), hairline, bold estimated total, one CTA | You see the math before you commit | Practice: Shares, Friday close, Estimated cost → Review step |
| 11 | **Quiet list rows** | 16px text, 44px tall, no icons | Density without noise | Board rows: ticker, name, sparkline, value, change, badge |
| 12 | **Restrained palette** | 5 text colours on the page: ink, paper, one grey, one accent, one surface | Colour only ever means something | Ink, paper, one grey, blue; green/red only for direction |
| 13 | **Short, plain motion** | `color 0.3s` on 119 link nodes; `opacity 0.3s, transform 0.3s` on reveals; `border-color 0.2s` on inputs; no bounce | Feedback is felt, not watched | 200ms colour/border, 300ms ease-out opacity+translate; off under `prefers-reduced-motion` |

## Not borrowed

- The name, logo, feather mark, illustrations, app-promo modals, marketing copy.
- Their proprietary typefaces. Stone keeps Bricolage Grotesque, Figtree and Doto.
- Their greens as a brand colour. Stone's accent stays `#2563EB`; up/down colours are Stone's own values, used only as meaning.
- Their black-first default. Stone is white paper, black ink; dark only in Pro.
