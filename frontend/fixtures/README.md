# Stone API fixtures (real data)

Exact responses from the Stone API, saved as JSON so another UI can be built or
compared offline. Regenerate with:

```bash
cd backend
uv run python scripts/export_fixtures.py BX AAPL NVDA JPM AMZN
```

The export refuses to run if any sample (fictional) rows are in the database, so
**everything here is real data**.

## Every file

```json
{ "meta": { "endpoint": "...", "as_of": "YYYY-MM-DD", "generated_at": "ISO time", "sources": ["alpaca-iex", "fred", "sec"], "note": "only when something is illustrative" },
  "data": <exact API response> }
```

`as_of` is the last price day in the database. `sources`: `sec` (EDGAR filings,
XBRL, Form 4), `alpaca-iex` (daily prices, IEX feed, split-adjusted), `fred` (DGS10).

## Files

| File | Endpoint | What it is |
|---|---|---|
| `<TICKER>/company.json` | `GET /api/companies/<T>` | Company screen |
| `<TICKER>/lab_insider_cluster.json` | `GET /api/lab/<T>/insider_cluster` | Signal test with every case |
| `<TICKER>/lab_rate_jump.json` | `GET /api/lab/<T>/rate_jump` | Signal test with every case, judged against SPY (`vs_market: true`) |
| `<TICKER>/lab_gap_down.json` | `GET /api/lab/<T>/gap_down` | Signal test with every case |
| `market_rate_jump.json` | `GET /api/market/rate_jump` | The rate-jump test run on SPY itself (hit = SPY lower). Same shape as a lab file, plus `symbol`. |
| `holdings.json` | `POST /api/portfolio` | Holdings board. `data.request` + `data.response`. Share counts are illustrative; prices and signals are real. |
| `reconcile_example.json` | `POST /api/import/reconcile` | Screenshot check. The input is a made-up read with one misread share count; the BX price is real. |

## company.json → `data`

| Field | Meaning |
|---|---|
| `company` | `ticker, name, sector, kind ("stock"/"etf"), cik, source` |
| `last` | `close, day, change` (fraction, 0.0103 = +1.03%) |
| `prices[]` | `day, open, close`, oldest first. The chart series. |
| `filings[]` | Latest 12 non-Form-4 filings: `form, accepted_at` (SEC acceptance, ISO with offset), `filed_date, report_date, accession, url` (sec.gov link). Use as chart pins. |
| `insider_sales[]` | Latest Form 4 sale lines: `accepted_at, owner_name, owner_title, transaction_date, shares, price, accession, seq` |
| `facts[]` | Latest XBRL figures: `key, pro` (name), `lite` (plain name), `concept` (e.g. `us-gaap:Revenues`), `value, unit, period_start, period_end, form, accession` |
| `rate` | Latest DGS10: `day, value` (percent) |
| `signals[]` | One per signal, same shape as a lab file (below) |
| `state` | `"CALM"` or `"WATCH"`. WATCH only when a STRONG signal is firing. |

One-sentence reason for the state: take the first signal that is firing and STRONG,
else the first that is firing. For Lite, say "`lite`, and for this stock that has mattered
before." (STRONG) or "`lite`, but that hasn't clearly mattered here before." (otherwise).
With nothing firing: "Nothing important today." (`frontend/src/lib/words.ts`).

## lab_*.json → `data` (one signal test)

| Field | Meaning |
|---|---|
| `signal, lite, pro, horizon` | Key, plain name, precise name, horizon in trading days |
| `vs_market` | `true` for the rate jump: a hit means the stock **did worse than SPY** over the same days, not just "was lower" |
| `n, hits, hit_rate` | Past cases; how many came true (lower, or worse than SPY when `vs_market`); hits / n |
| `normal_n, normal_hits, normal_rate` | Same measurement on normal days (whole horizon clear of any event), judged the same way |
| `low, high` | 90% Wilson range for the hit rate |
| `label` | `"WEAK"` (n < 10), `"STRONG"` (low > normal_rate), else `"NOT PROVEN"` |
| `firing` | `{known_at, note}` if the signal is live now, else null |
| `holdout` | Only for STRONG: `{first, second, held_up}`, the same test on each half of the history |
| `cases[]` | `known_at` (when the public could know), `entry_day` (next open), `exit_day`, `ret` (the stock's own return), `market_ret` (SPY over the same days, only when `vs_market`, else null), `hit` (came true) |

## holdings.json → `data.response`

`total`; `rows[]` (`symbol, name, kind, shares, price, value, change`); `exposure[]`,
WATCH first: `symbol, name, direct` ($ held directly), `via_etf` ({ETF: $}), `total`,
`share_of_total, bad_day_return` (1-in-20 worst daily move, past year), `bad_day_loss`
(that move × total, in $), `state, firing[]` (firing signals, no cases); `unknown[]`.

## Not in these fixtures yet (not built)

- **Numbers checked against the filing** (Gemini summary vs XBRL, ✓/≠): needs Gemini. `facts[]` has the XBRL side.
- **"Today" counts and the one top item** (today's filings + news, ranked by Boudoukh et al. Table 3): no news source connected yet.
- **Annualized volatility**: not computed yet. `bad_day_return` is the 1-day 95% historical move.

## Known caveat in this export

The rate jump uses the same 15 dates for every stock, and SPY itself was lower after
10 of them (vs 38% of normal weeks; `market_rate_jump.json`). So the rate jump is judged
against SPY: a hit = the stock did worse than SPY over the same days. Under that rule
the full scan finds 10 STRONG of 111 testable stock-signal pairs, with about 6 expected by
chance alone: 9 rate jumps (ACN, CRM, CVS, FDX, HD, INTU, META, PYPL, SBUX) plus AMZN's
insider cluster. That is not far above luck, and the 9 rate-jump results share the same 15
dates, so they are not independent. None of the five tickers exported here has a STRONG
rate jump. AMZN's insider-selling cluster is still the one STRONG in this set.
