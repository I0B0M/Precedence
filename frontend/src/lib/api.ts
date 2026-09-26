// Shapes returned by the FastAPI backend (backend/stone/api). Keep in step with views.py.

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
  // held up only with 10+ cases in each half, each beating its own normal rate
  holdout: { first: Half; second: Half; held_up: boolean;
    verdict?: "held up" | "did not hold" | "too few cases to check" } | null;
  cases?: Case[];
}

/** GET /api/market/rate_jump: the plain "was it lower?" rate-jump test run on the market itself. */
export interface MarketResult extends SignalResult {
  symbol: string; // "SPY" on real data
}

/** GET /api/funds/{symbol}: what's in a fund, how it's doing, what's next. */
export interface FundHolding {
  ticker: string;
  name: string | null; // null when Stone doesn't track the stock
  weight: number; // share of the fund, 0..1
  in_stone: boolean; // Stone has prices and signals for it
  state: State | null; // null when not tracked
  firing: { signal: string; label: Label }[];
  lite_line: string | null; // e.g. "Executives sold shares, and for this stock that has mattered before."
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
}

export interface CompanyRow {
  ticker: string;
  name: string;
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
}

export interface CompanyDetail {
  company: { ticker: string; name: string; sector: string | null; kind: "stock" | "etf"; cik: number | null; source: string };
  last: { close: number; day: string; change: number | null } | null;
  prices: { day: string; open: number; close: number }[];
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
  name: string;
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

export interface PortfolioOut {
  total: number;
  rows: { symbol: string; name: string; kind: string; shares: number; price: number; value: number; change: number | null }[];
  exposure: ExposureRow[];
  unknown: string[];
  funds: FundInfo[];
  price_as_of: string | null; // the market close the values are priced at, e.g. "2026-09-25"
}

/** One per ETF held. The board should say "holdings as of <as_of>, <source>" for each fund. */
export interface FundInfo {
  symbol: string;
  as_of: string | null; // null: no holdings loaded, so the whole fund shows as one row
  source: string | null; // "ssga" = State Street's daily file; "sample" in sample mode
  looked_through: number; // share of the fund split out into stocks we have data for, 0..1
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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
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
  scan: () => call<Scan | null>("/api/scan"),
  labSignals: () => call<{ key: string; lite: string; pro: string; horizon: number }[]>("/api/lab/signals"),
  lab: (t: string, s: string) => call<SignalResult>(`/api/lab/${encodeURIComponent(t)}/${s}`),
  marketRateJump: () => call<MarketResult>("/api/market/rate_jump"),
  fund: (symbol: string) => call<FundPage>(`/api/funds/${encodeURIComponent(symbol)}`),
  filingSummary: (accession: string) => call<FilingSummary>(`/api/filings/${encodeURIComponent(accession)}/summary`),
  today: (symbols: string[] = []) =>
    call<Today>(`/api/today${symbols.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : ""}`),
  portfolio: (holdings: Holding[]) => call<PortfolioOut>("/api/portfolio", post({ holdings })),
  reconcile: (rows: ReadRow[], printed_total: number | null) =>
    call<Reconciled>("/api/import/reconcile", post({ rows, printed_total })),
  screenshot: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<Reconciled>("/api/import/screenshot", { method: "POST", body: form });
  },
};
