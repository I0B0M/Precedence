# Stone — issue drafts (not yet posted)

Every issue names the Blackstone brief line it answers. Order = build order.
MUST = never cut. SHOULD / COULD = cut from the bottom if behind (13 → 12 → 11 → 10 → 9).

---

## 1. Repo scaffold: backend, frontend, README library list
**Priority:** MUST · **Brief:** infrastructure for everything below

**What**
- `backend/`: Python 3.12, FastAPI, uv, `pyproject.toml`
- `frontend/`: Next.js (empty shell)
- `data/cache/` gitignored; `.env.example` with key names only
- `README.md` with a "Libraries we use" section (Devpost requires every external library listed)

**Done when**
- `uv run pytest` passes (one placeholder test) and `npm run dev` serves a blank page

---

## 2. Postgres schema on Tiger Data
**Priority:** MUST · **Brief:** "spread across different sources" → one place

**What**
- `backend/stone/schema.sql`: `companies`, `filings` (accession, form, SEC acceptance time), `xbrl_facts`, `insider_trades` (per Form 4 transaction: code, shares, price, acceptance time), `prices_daily` (OHLCV), `rates` (DGS10)
- `prices_daily` as a Tiger Data hypertable
- Same file runs on local Postgres as a fallback

**Done when**
- Schema applies cleanly to both Tiger Data and local Postgres

---

## 3. SEC ingester: filings, XBRL facts, Form 4 insider sales
**Priority:** MUST · **Brief:** "company filings" · "discover trends and risks"

**What**
- Our own SEC client: User-Agent with contact email, max 8 req/s, every response cached to `data/cache/`
- Filings from `submissions` JSON (keep acceptance time); XBRL from `companyfacts`
- Form 4 XML parsed with the standard library; store every transaction, flag code `S` (sale)
- 20 tickers: AAPL MSFT NVDA AMZN GOOGL META TSLA AMD INTC NFLX JPM BAC XOM CVX JNJ PFE KO WMT DIS BX

**Done when**
- Re-running with wifi off rebuilds from cache
- One AAPL Form 4 and one AAPL revenue figure match sec.gov by hand

---

## 4. Prices (2y daily) and FRED DGS10 ingest
**Priority:** MUST · **Brief:** "market data" · "economic trends" · "visualize performance"

**What**
- Massive (ex-Polygon) split-adjusted daily bars, 2 years, 20 tickers + SPY + QQQ (5 req/min)
- FRED DGS10, 2 years
- Both cached to disk first

**Done when**
- ~500 price days per ticker; DGS10 series has no gaps beyond market holidays

---

## 5. Signal engine + unit tests
**Priority:** MUST · **Brief:** "discover trends and risks" · "turn information into meaningful insight"

**What**
- Per stock, 2 years:
  - Insider-selling cluster: 3+ Form 4 sales in 10 days → 20-day forward return
  - Rate jump: DGS10 up ≥ 0.15pt in a week → 5-day forward return
  - 5% gap down → 20-day forward return
- Timestamp by SEC acceptance time; measure from the next open
- Compare against that stock's normal-period rate; 90% Wilson range
- Label: WEAK if n < 10; STRONG only if Wilson lower bound > normal rate; else NOT PROVEN
- CALM / WATCH per holding: WATCH only when a proven signal is firing
- Signal Lab endpoint: pick any ticker + signal and get the result live (a judge drives this in the demo)

**Done when**
- Unit tests cover each signal and each label
- Each test has been watched failing (mutate the code, see red, restore)

---

## 6. Company screen (Lite + Pro)
**Priority:** MUST · **Brief:** "understanding what they own" · "summarize complex information"

**What**
- One screen per holding: filings, prices, rates and news together
- Lite: plain English, dollars. Pro: same data with the working shown
- Toggle by tapping the O in "ST◯NE"
- Lite design: cream #FFFBF2, black ink, orange #F26B21, 1.5px black outlines; Doto / Bricolage Grotesque / Figtree. No glows, glass or gradients

**Done when**
- One real ticker end to end (target: before Blackstone coaching, Sat 5–6pm, Room 140)

---

## 7. Holdings board with CALM / WATCH
**Priority:** MUST · **Brief:** "analyze their existing portfolio" · "make decisions"

**What**
- Every holding with its CALM / WATCH state and the signal behind any WATCH
- Real exposure, including what you hold inside ETFs

**Done when**
- A sample portfolio shows the correct state for every holding, backed by the signal engine

---

## 8. Screenshot import (Gemini vision) + SnapTrade Robinhood
**Priority:** MUST · **Brief:** "spread across different sources" · "understanding what they own"

**What**
- Screenshot from any brokerage app → Gemini reads the rows
- Rows must sum to the total printed on the screenshot; otherwise flag the row and let the user fix it
- SnapTrade Robinhood read-only connect as the headline path (free tier: 1 user, 5 connections)

**Done when**
- A demo screenshot imports and reconciles to its total; SnapTrade connects a real account read-only

---

## 9. Gemini filing summary checked against XBRL
**Priority:** SHOULD · **Brief:** "summarize complex information"

**What**
- Plain-English summary of the latest 10-K / 10-Q
- Every number in it reconciled against XBRL: ✓ when it matches, ≠ with both sources shown when it doesn't

**Done when**
- The AAPL summary shows ✓ / ≠ on every figure

---

## 10. Five-tap first screen with real counts
**Priority:** SHOULD · **Brief:** "more accessible, actionable, and engaging"

**What**
- No account. 5 tap-only steps: what you own → where → how often you check → what worries you → connect
- Big number shrinks as you answer ("1,284 things happened today" → "1 thing matters to you")
- Counts are REAL: today's EDGAR filings + Federal Register documents + news for your holdings
- Ends on the one thing that matters, with proof. Google / email sign-in only at the end, to save

**Done when**
- Each count traces back to a real API response we can show a judge

---

## 11. Practice trading: Alpaca paper, with pre-trade receipt
**Priority:** SHOULD · **Brief:** "make decisions" · "actionable"

**What**
- $10,000 practice money via Alpaca paper trading
- Receipt before every trade: exposure after, bad-day loss after, signals firing
- Framed as "stay on top of your money", never "trade more"

**Done when**
- A paper trade goes through and shows its receipt

---

## 12. News ranking + Congress.gov / Federal Register cards
**Priority:** COULD · **Brief:** "news" · "discover trends and risks"

**What**
- Rank news by type using Boudoukh, Feldman, Kogan & Richardson (NBER w18725, Table 3) variance ratios
- Congress.gov bills + Federal Register rules / executive orders for your holdings

**Done when**
- The company screen lists today's items in ranked order, with the ratio shown in Pro

---

## 13. Pro HUD theme, phone layout, wallet paste
**Priority:** COULD · **Brief:** "more … engaging" · "visualize performance"

**What**
- Dark command-center theme, purple #8E6CF0 accent: particle core (calm when CALM, agitated when anything is on WATCH), holdings rail with sparklines, quick-action rail, morning headlines
- Phone layout; paste a public wallet address

**Done when**
- The Pro toggle switches the theme and the core reacts to portfolio state
