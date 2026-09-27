// Shapes returned by the FastAPI backend (backend/stone/api). Keep in step with views.py.

import { andList } from "./format";

export type Label = "STRONG" | "WEAK" | "NOT PROVEN" | "NO DATA"; // NO DATA: source data not loaded, nothing tested
export type State = "CALM" | "WATCH";

export interface Case {
  known_at: string;
  entry_day: string;
  exit_day: string;
  ret: number; // the stock's own return
  market_ret: number | null; // SPY over the same days, only for vs_market signals
  hit: boolean;
  note: string;
}

export interface SignalResult {
  signal: string;
  lite: string;
  pro: string;
  horizon: number;
  vs_market: boolean; // true: a hit means "did worse than the market (SPY)", not "was lower"
  n: number;
  hits: number;
  hit_rate: number | null;
  normal_n: number;
  normal_hits: number;
  normal_rate: number | null;
  low: number | null;
  high: number | null;
  label: Label;
  firing: { known_at: string; note: string } | null;
  note?: string | null; // why there is no result, for label "NO DATA"
  // From the latest full scan's Benjamini-Hochberg run (10% FDR across every stock-signal pair with 10+ cases):
  // true = still stands after correcting for testing them all at once; false = doesn't; null = not in that run
  // (fewer than 10 cases, no p-value, a fund, or no scan yet)
  fdr10_survives?: boolean | null;
  // held up only with 10+ cases in each half, each beating its own normal rate
  holdout: { first: Half; second: Half; held_up: boolean;
    verdict?: "held up" | "did not hold" | "too few cases to check";
    split_day?: string | null; // the second half's first trading day
    // cases in neither half: first.n + second.n + excluded.n = n. reason is null only when n is 0
    excluded?: HoldoutExcluded } | null;
  cases?: Case[];
  // The stricter test (it also counts the normal rate's own uncertainty). Pro shows it as the evidence behind
  // "borderline"; it never changes the label. null below 10 cases, or when it can't be rebuilt from saved data.
  strict?: { p: number; diff_low: number; diff_high: number; normal_periods: number } | null;
}

/** GET /api/market/rate_jump: the plain "was it lower?" rate-jump test run on the market itself. */
export interface MarketResult extends SignalResult {
  symbol: string; // "SPY" on real data
}

/** GET /api/funds/{symbol}: what's in a fund, how it's doing, what's next. */
export interface FundHolding {
  ticker: string;
  name: string | null; // display name, cleaned ("Micron Technology"); from the issuer's file when untracked; null if neither
  legal_name?: string | null; // exactly as SEC (tracked) or the issuer's file (untracked) prints it; always sent
  weight: number; // share of the fund, 0..1
  in_stone: boolean; // Stone has prices and signals for it
  state: State | null; // null when not tracked
  firing: { signal: string; label: Label }[];
  lite_line: string | null; // e.g. "Insiders sold shares, and for this stock that has mattered before."
}

export interface FundPage {
  symbol: string;
  name: string;
  price: { last_close: number; as_of: string; prev_close: number | null; change_1d: number | null } | null;
  // fractions over 21/63/252 trading days; `basis` says so in words for the page
  performance: { d30: number | null; d90: number | null; y1: number | null; as_of: string | null; basis: string };
  fund_state: State | null; // from the fund's own tested signals (SPY: market rate jump); null if never tested
  fund_firing: SignalResult[];
  holdings_as_of: string | null;
  holdings_source: string | null; // "ssga"
  total_holdings_count: number; // 504 for SPY
  looked_through_share: number; // weight in stocks Stone tracks, 0..1
  holdings: FundHolding[]; // top 25 by weight
  heads_up: { ticker: string; name: string; weight: number }[]; // WATCH among the top 25 holdings
  filings_span: { start: string; end: string } | null;
  week_filings: { ticker: string; form: string; accepted_at: string; url: string | null }[]; // top 25 holdings
  note: string | null; // e.g. "Holdings for QQQ aren't loaded yet."
}

/** GET /api/filings/{accession}/summary: Gemini's plain summary, every figure checked against XBRL. */
export interface FilingFigure {
  label: string; // e.g. "Revenue"
  kind: string; // revenue | net_income | eps_diluted | operating_income | total_assets | total_liabilities | long_term_debt | cash | equity | other
  text_value: string; // exactly as the filing prints it, e.g. "$5.0 billion"
  value: number | null; // Gemini's number in full units (USD, or USD per share)
  period_end: string | null;
  concept: string | null; // the XBRL concept it was checked against, e.g. "us-gaap:Revenues"
  xbrl_value: number | null; // the filing's own XBRL number for that concept and date
  match: boolean | null; // true ✓, false ≠ (never hidden), null = nothing in XBRL to check against
}

export interface FilingSummary {
  accession: string;
  ticker: string;
  form: string;
  accepted_at: string;
  url: string | null;
  summary_lite: string; // at most 3 sentences, plain words
  figures: FilingFigure[];
  model: string;
  generated_at: string;
  cached: boolean;
}

/** Full-history cases the hold-out halves can't hold, e.g. a window that starts before the split and ends after it. */
export interface HoldoutExcluded {
  n: number;
  hits: number;
  reason: string | null; // e.g. "Its 20-trading-day window starts before the split (2025-09-09) and ends after it, …"
  cases: { known_at: string; entry_day: string; exit_day: string; hit: boolean }[];
}

export interface Half {
  n: number;
  hits: number;
  hit_rate: number | null;
  normal_rate: number | null;
  normal_n: number;
  label: Label;
}

export interface Scan {
  run_at: string;
  stocks: number;
  tested: number;
  eligible: number;
  strong: number;
  strong_held_up: number;
  strong_fdr10: number | null; // STRONG that survive Benjamini-Hochberg at 10% FDR; null for older scans
  expected_by_chance: number;
  as_of: string;
}

export interface Status {
  data: "empty" | "sample" | "real" | "mixed";
  companies_by_source: Record<string, number>;
  summaries?: boolean; // false: /api/filings/{acc}/summary answers 503, so don't call it
  screenshots?: boolean; // false: /api/import/screenshot answers 503 (same key as summaries)
}

export interface CompanyRow {
  ticker: string;
  name: string; // display name, cleaned: "AT&T", "Costco Wholesale", "McDonald's"
  legal_name?: string; // as SEC lists it: "At&T Inc.", "Costco Wholesale Corp /New", "Mcdonalds Corp"; always sent
  sector: string | null;
  kind: "stock" | "etf";
  source: string;
  last_close: number | null;
  as_of: string | null;
  change: number | null;
}

export interface Fact {
  key: string;
  pro: string;
  lite: string;
  concept: string;
  value: number;
  unit: string;
  period_start: string | null;
  period_end: string;
  form: string;
  accession: string;
}

export interface Filing {
  accession: string;
  form: string;
  filed_date: string;
  accepted_at: string;
  report_date: string | null;
  url: string | null;
}

export interface InsiderSale {
  accepted_at: string;
  owner_name: string | null;
  owner_title: string | null;
  transaction_date: string | null;
  shares: number | null;
  price: number | null;
  accession: string;
  seq: number;
  url?: string | null; // the Form 4 on sec.gov (SEC's readable page); null for sample data. Always sent
}

export interface CompanyDetail {
  company: { ticker: string; name: string; legal_name?: string; sector: string | null; kind: "stock" | "etf"; cik: number | null; source: string };
  last: { close: number; day: string; change: number | null } | null;
  prices: { day: string; open: number; high?: number; low?: number; close: number }[];
  /** Saved data only: where each part of a bar came from when it isn't all Alpaca (IEX feed). */
  price_sources?: { close: string; high_low: string; last?: string };
  filings: Filing[];
  insider_sales: InsiderSale[];
  facts: Fact[];
  rate: { day: string; value: number } | null;
  signals: SignalResult[];
  state: State | null;
}

export interface Holding {
  symbol: string;
  shares: number;
}

export interface ExposureRow {
  symbol: string;
  name: string; // display name, cleaned
  legal_name?: string;
  sector: string | null;
  direct: number; // dollars held directly (for a fund: the whole fund)
  via_etf: Record<string, number>; // dollars inside your funds (stocks only)
  total: number; // dollars this row stands for on the board; rows add up to PortfolioOut.total
  share_of_total: number | null;
  bad_day_return: number | null;
  bad_day_loss: number | null;
  state: State | null; // null: a fund we never tested ("Not tested"), never CALM
  firing: SignalResult[]; // for SPY: the market rate-jump result (signal "market_rate_jump")
  children: { symbol: string; name: string; total: number }[]; // fund rows: slices under 1%, kept inside
}

/** A 401(k)/IRA fund as typed or read from a statement. */
export interface RetirementIn { kind: "retirement"; fund: string; amount: number; account?: "401(k)" | "IRA" }

/** A home, carrying the fields from POST /api/estimate/home. The API stays stateless: the browser sends it each time. */
export interface PropertyIn { kind: "property"; label?: string; address?: string; paid: number; bought_year: number;
  estimate: number; source?: string; as_of?: string | null }

/** A non-traded fund (Blackstone's BREIT or BCRED), valued at the amount the user entered. Ticker as typed. */
export interface PrivateFundIn { kind: "private_fund"; fund: string; amount: number }

export interface PortfolioIn { holdings: Holding[]; other?: (PropertyIn | RetirementIn | PrivateFundIn)[] }

export interface PrivateFundRow {
  kind: "private_fund";
  fund: string; // "BREIT" | "BCRED"
  name: string;
  amount: number; // dollars as entered; this is the value used, never a market price
  nav: number | null; // latest monthly NAV per share, Class I
  nav_as_of: string | null; // the month end that NAV is for
  nav_url: string | null; // the SEC filing that states it
  share_class: "I";
  shares: number | null; // amount / nav, for Pro; null without a NAV
  state: null; // "Not tested": no daily prices
}

/** GET /api/funds/BREIT | BCRED: a non-traded fund, priced monthly by its own SEC filings. No holdings list. */
export interface PrivateFundPage {
  kind: "private_fund";
  symbol: string;
  name: string;
  sponsor: "Blackstone";
  pricing: "monthly NAV";
  nav: { value: number; as_of: string; share_class: "I"; form: "424B3" | "8-K"; accession: string; url: string } | null;
  history: { as_of: string; nav: number; url: string }[]; // month ends, oldest first; each value's own filing
  returns: { m1: number | null; m3: number | null; m12: number | null; basis: string }; // NAV change only; fractions; null if a month is missing
  // Class I gross distribution per share, one per month (record-date month), each from its own 8-K; oldest first
  distributions?: { month: string; amount: number; record_date: string; url: string }[];
  // (NAV at the end + distributions whose record date falls in the window) / NAV at the start - 1. Not reinvested.
  // null when either NAV or any month's distribution in the window has no filing: never estimated
  total_return?: { m1: number | null; m3: number | null; m12: number | null; basis: string };
  invests_in: { text: string; url: string } | null; // ≤12 words, quoted from its latest 10-Q/10-K
  liquidity_note: string | null; // its own repurchase limits, quoted
  liquidity_url: string | null; // the filing that note quotes
  filings: { form: string; accepted_at: string; url: string }[]; // latest 10-Q, 10-K and NAV filing
  holdings: []; // never listed
  state: null;
  source: string; // e.g. "SEC EDGAR: BCRED monthly 8-K (Item 8.01)"
}

export interface RetirementRow {
  kind: "retirement";
  fund: string; // as typed
  ticker: string | null;
  name: string | null;
  account: string | null;
  amount: number;
  behaves_like: string | null; // "SPY" when mapped; its dollars then join SPY's look-through on the board
  match: "exact index" | "close stand-in" | null;
  state: State | null; // the stand-in's state; null when not mapped ("Not tested")
  note: string | null;
}

export interface PropertyRow {
  kind: "property";
  label: string;
  paid: number;
  bought_year: number;
  estimate: number; // an estimate, never a price
  source: string | null;
  as_of: string | null;
  state: null; // no signals run on a home
}

export interface PortfolioOut {
  total: number; // what the exposure rows add up to: investments + mapped retirement funds
  rows: { symbol: string; name: string; legal_name?: string; kind: string; shares: number; price: number; value: number; change: number | null;
    renamed_from?: string | null }[]; // e.g. "SPLG" when valued as SPYM (renamed 2025-10-31)
  exposure: ExposureRow[];
  unknown: string[];
  funds: FundInfo[];
  price_as_of: string | null; // the market close the values are priced at, e.g. "2026-09-25"
  retirement: RetirementRow[];
  properties: PropertyRow[];
  private_funds?: PrivateFundRow[]; // always sent; not on the board, not in the day change
  subtotals: {
    investments: number; // brokerage holdings
    retirement: number; // every 401(k)/IRA row, mapped or not
    home_estimate: number;
    private_funds?: number; // BREIT/BCRED amounts as entered; always sent, included in total
    total: number; // everything above
    includes_home_estimate: boolean; // say "includes a home estimate" next to the total when true
  };
}

/** One per ETF held. The board should say "holdings as of <as_of>, <source>" for each fund. */
export interface FundInfo {
  symbol: string;
  as_of: string | null; // null: no holdings loaded, so the whole fund shows as one row
  source: string | null; // "ssga" = State Street's daily file; "sample" in sample mode
  looked_through: number; // share of the fund split out into stocks we have data for, 0..1
  holdings_from?: string | null; // VOO / IVV / SPLG: "SPY" (they track the S&P 500; SPY's holdings are used)
  note?: string | null; // e.g. "Tracks the S&P 500; holdings from SPY, State Street."
}

/** POST /api/estimate/home: purchase price × the FHFA house price index change since the purchase year. */
/** Either a full street address (geocoded by the Census) or a 5-digit ZIP (no geocoding). */
export interface HomeEstimateIn { address?: string; zip?: string; paid: number; bought_year: number; bought_month?: number | null }

export interface HomeEstimate {
  kind: "property";
  located_by: "address" | "zip"; // which input was used
  address: string | null; // as typed
  address_matched: string | null; // as the Census geocoder matched it
  zip: string | null;
  county_fips: string | null;
  us_state: string | null; // two-letter state
  paid: number;
  bought_year: number;
  estimate: number; // an estimate, never a price
  index_change: number | null; // fraction, 0.42 = +42% since the purchase year
  index_from: { year: number; value: number } | null;
  index_to: { year: number; value: number } | null;
  index_level: "zip5" | "county" | "state" | null; // which FHFA series was used
  method: string; // "paid × FHFA ZIP5 index change"
  source: string; // "FHFA House Price Index, 5-digit ZIP (annual, developmental)"
  geocoder: string; // "US Census Geocoder"
  // where the Census geocoder placed the matched address (WGS84 degrees), for a map pin; always sent.
  // null when located_by is "zip": no ZIP centre is looked up, so there is no point to place
  lat?: number | null;
  lon?: number | null;
  as_of: string | null; // the latest index year used
  note: string | null; // e.g. fallback to county, or bought after the latest index year
  state: null;
}

/** GET /api/funds/lookup?q=FXAIX: which index a 401(k)/IRA fund tracks. */
export interface FundLookup {
  query: string;
  ticker: string | null;
  name: string | null;
  category: string | null; // "S&P 500 index", "US total market index", "Target date", "Bond", "International"…
  behaves_like: "SPY" | null;
  match: "exact index" | "close stand-in" | null;
  basis: string | null; // e.g. "Benchmark: S&P 500 Index"
  source: string | null; // where the benchmark was checked (prospectus / SEC filing)
  note: string | null;
}

/** GET /api/today: real counts for the last trading day, from Stone's database only. */
export interface Today {
  day: string | null; // the last trading day in the price data
  market: {
    filings: { count: number; companies: number; by_form: Record<string, number>; as_of: string | null; source: string };
    rate: { series: "DGS10"; day: string; value: number; change_week: number | null; known_at: string; source: string } | null;
  };
  /** The 7 days ending on `day`. Lead with this on the start screen; one day is often thin. */
  week: {
    start: string; end: string; days: number;
    filings: { count: number; companies: number; by_form: Record<string, number>; as_of: string | null; source: string };
    rate: { series: "DGS10"; first_day: string; first_value: number; last_day: string; last_value: number;
      change: number; jumps: { known_at: string; note: string }[]; source: string } | null;
  } | null;
  holdings: {
    symbols: string[];
    unknown: string[];
    filings: { count: number; as_of: string | null; source: string;
      items: { ticker: string; form: string; accepted_at: string; url: string | null }[] };
    week_filings: { count: number; start: string | null; as_of: string | null; source: string;
      items: { ticker: string; form: string; accepted_at: string; url: string | null }[] };
    signals: { firing: number; strong_firing: number; as_of: string | null; source: string;
      items: { symbol: string; signal: string; label: Label }[] };
  } | null; // null when no symbols were passed
}

export interface SourceRef {
  source: string | null; // as stored: "alpaca-iex" | "sec" | "fred" | "sample"
  name: string | null; // in words, e.g. "SEC EDGAR"
}

/** GET /api/companies/{t}/today: one holding's last trading day and its last 5 trading days, as facts with
 *  sources. Nothing in it says why the price moved; don't add a cause in the UI either. */
export interface CompanyToday {
  ticker: string;
  name: string; // display name, cleaned
  legal_name?: string;
  as_of: string; // the stock's last trading day in the price data
  close: number | null;
  prev_close: number | null;
  day_change: number | null; // dollars per share
  day_change_pct: number | null; // a fraction, like every other change here: 0.012 = +1.2%
  market_symbol: string; // "SPY" on real data
  spy_change_pct: number | null; // the market on the same day, a fraction; null if it has no bar that day
  // size of the move only: within 0.5 percentage point of the market = "with"; otherwise the bigger move wins.
  // A stock up 0.1% on a day the market fell 1.5% is "less than the market" — read same_direction too
  vs_market: "with the market" | "more than the market" | "less than the market" | null;
  same_direction: boolean | null;
  window: { start: string; end: string; trading_days: number; note: string };
  events: {
    filings: { form: string; accepted_at: string; url: string | null }[]; // not Form 4s (those are insider_sales)
    // null: Form 4s aren't loaded for this stock, so say "not loaded", never "no insider sales"
    insider_sales: { accepted_at: string; owner_name: string | null; owner_title: string | null;
      transaction_date: string | null; shares: number | null; price: number | null; url: string | null }[] | null;
    // 10-year yield: latest reading vs the last reading before the window; change in percentage points
    rate_move: { series: "DGS10"; from_day: string; from_value: number; to_day: string; to_value: number;
      change: number; known_at: string; jumps: { known_at: string; note: string }[] } | null;
    // every signal firing now; in_window = it became known inside the window
    signals_firing: { signal: string; lite: string; label: Label; known_at: string; note: string;
      in_window: boolean; fdr10_survives: boolean | null }[];
  };
  sources: {
    prices: SourceRef & { as_of: string };
    market: SourceRef & { symbol: string };
    filings: SourceRef[];
    rate: (SourceRef & { series: "DGS10"; as_of: string }) | null;
    signals: { source: "stone"; name: string; scan_run_at: string | null };
  };
}

export interface ReadRow {
  symbol: string;
  shares: number | null;
  price: number | null;
  value: number | null;
}

export interface Reconciled {
  status: "ok" | "fixable" | "needs_review" | "no_total";
  rows_sum: number;
  printed_total: number | null;
  difference: number | null;
  message: string;
  rows: (ReadRow & { ok: boolean; problem: string | null; fix: Partial<Record<"shares" | "value", number>> })[];
}

/** POST /api/portfolio/risk: how bumpy this mix has been, next to the market. QuantStats on daily closes. */
export interface RiskFigures {
  volatility: number; // annualised
  max_drawdown: number; // negative
  drawdown_start: string;
  drawdown_bottom: string;
  beta: number | null; // null for the market itself
  sharpe: number;
  worst_day: number;
  worst_day_on: string;
  total_return: number;
  max_drawdown_dollars?: number; // portfolio only: at today's total
  worst_day_dollars?: number;
}

export interface PortfolioRisk {
  total: number;
  symbols: string[];
  unknown: string[];
  market_symbol: string;
  start: string;
  end: string;
  days: number;
  portfolio: RiskFigures;
  market: RiskFigures;
  basis: string;
  source: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Saved data: the live demo runs without the backend, on real API responses saved at one market close
// (frontend/public/saved, built by backend/scripts/build_saved.py). Anything not saved answers 404, or 503 for
// what needs the backend (screenshots, typed rows, filing summaries), and every page already handles both.
export const SAVED = process.env.NEXT_PUBLIC_STONE_SAVED === "1";

const ticker = (s: string) => s.trim().toUpperCase();
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // Python's sorted() order, as holdings_key

/** The Portfolio key, same as holdings_key() in backend/stone/portfolio/holdings.py: symbols sorted, "SYM-shares" joined by "_". */
export const savedKey = (holdings: Holding[]) =>
  holdings.map((h) => ({ s: ticker(h.symbol), n: h.shares })).sort((a, b) => byText(a.s, b.s)).map((h) => `${h.s}-${h.n}`).join("_");

/** `?symbols=` as the saved files are named: each once, upper case, sorted, comma-joined (build_saved.py live_extras). */
const symbolsKey = (symbols: string) => [...new Set(symbols.split(",").map(ticker).filter(Boolean))].sort(byText).join(",");

/** The one portfolio the saved data has (frontend/fixtures/holdings.json): real prices, illustrative share counts. */
export const SAVED_EXAMPLE: Holding[] = [
  { symbol: "BX", shares: 10 }, { symbol: "AAPL", shares: 10 }, { symbol: "NVDA", shares: 10 },
  { symbol: "JPM", shares: 10 }, { symbol: "AMZN", shares: 10 }, { symbol: "SPY", shares: 5 },
];
export const SAVED_TICKERS = andList(SAVED_EXAMPLE.map((h) => h.symbol));
export const SAVED_AS_OF = "Sep 25, 2026";

/** The example portfolio: the home page shows it, /import?example=1 fills it in. Saved data has one portfolio saved. */
export const EXAMPLE_PORTFOLIO: Holding[] = SAVED ? SAVED_EXAMPLE
  : [{ symbol: "BX", shares: 10 }, { symbol: "AMZN", shares: 5 }, { symbol: "SPY", shares: 3 }];

const NEEDS_BACKEND = "This needs the full app; the live demo runs on saved data.";

/** Where the saved data keeps the answer to this call, in the layout build_saved.py writes:
 *  GET /api/a/b → /saved/a/b.json, GET /api/a?symbols=X,Y → /saved/a/<symbolsKey>.json,
 *  POST /api/a with holdings → /saved/a/<savedKey>.json, keyed on the holdings only (a home or 401(k) sent
 *  alongside gets the saved board without it). Throws ApiError 503 for what only the backend can do
 *  (a POST without holdings: reconcile, screenshots, home estimates; filing summaries). */
export function savedFile(path: string, init?: RequestInit): string {
  const [route, query] = path.replace(/^\/api\//, "").split("?");
  if (init?.method === "POST") {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (!Array.isArray(body?.holdings)) throw new ApiError(503, NEEDS_BACKEND);
    return `/saved/${route}/${savedKey(body.holdings)}.json`;
  }
  if (route.endsWith("/summary")) throw new ApiError(503, NEEDS_BACKEND);
  const symbols = new URLSearchParams(query ?? "").get("symbols");
  return `/saved/${route}${symbols ? `/${symbolsKey(symbols)}` : ""}.json`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (SAVED) {
    const res = await fetch(savedFile(path, init));
    if (!res.ok) throw new ApiError(404, "Not in the saved data.");
    return res.json() as Promise<T>;
  }
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  status: () => call<Status>("/api/status"),
  companies: () => call<CompanyRow[]>("/api/companies"),
  company: (t: string) => call<CompanyDetail>(`/api/companies/${encodeURIComponent(t)}`),
  companyToday: (t: string) => call<CompanyToday>(`/api/companies/${encodeURIComponent(t)}/today`),
  scan: () => call<Scan | null>("/api/scan"),
  labSignals: () => call<{ key: string; lite: string; pro: string; horizon: number }[]>("/api/lab/signals"),
  lab: (t: string, s: string) => call<SignalResult>(`/api/lab/${encodeURIComponent(t)}/${s}`),
  marketRateJump: () => call<MarketResult>("/api/market/rate_jump"),
  fund: (symbol: string) => call<FundPage>(`/api/funds/${encodeURIComponent(symbol)}`),
  privateFund: (symbol: string) => call<PrivateFundPage>(`/api/funds/${encodeURIComponent(symbol)}`), // BREIT, BCRED
  filingSummary: (accession: string) => call<FilingSummary>(`/api/filings/${encodeURIComponent(accession)}/summary`),
  today: (symbols: string[] = []) =>
    call<Today>(`/api/today${symbols.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : ""}`),
  portfolio: (holdings: Holding[], extra: Omit<PortfolioIn, "holdings"> = {}) =>
    call<PortfolioOut>("/api/portfolio", post({ holdings, ...extra })),
  estimateHome: (body: HomeEstimateIn) => call<HomeEstimate>("/api/estimate/home", post(body)),
  lookupFund: (q: string) => call<FundLookup>(`/api/funds/lookup?q=${encodeURIComponent(q)}`),
  reconcile: (rows: ReadRow[], printed_total: number | null) =>
    call<Reconciled>("/api/import/reconcile", post({ rows, printed_total })),
  risk: (holdings: Holding[]) => call<PortfolioRisk>("/api/portfolio/risk", post({ holdings })),
  /** The backend panel's briefing, unparsed: lib/briefing/source.ts checks its shape before anything is spoken. */
  // extras: the home, 401(k)/IRA and private funds (portfolioExtras()), so the script's total is the board's;
  // saved mode still keys the file by the holdings alone
  briefing: (holdings: Holding[], extras: Omit<PortfolioIn, "holdings"> = {}) =>
    call<unknown>("/api/briefing/portfolio", post({ holdings, ...extras })),
  screenshot: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<Reconciled>("/api/import/screenshot", { method: "POST", body: form });
  },
};
