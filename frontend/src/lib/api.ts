// Shapes returned by the FastAPI backend (backend/stone/api). Keep in step with views.py.

export type Label = "STRONG" | "WEAK" | "NOT PROVEN";
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
  holdout: { first: Half; second: Half; held_up: boolean } | null;
  cases?: Case[];
}

/** GET /api/market/rate_jump: the plain "was it lower?" rate-jump test run on the market itself. */
export interface MarketResult extends SignalResult {
  symbol: string; // "SPY" on real data
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
  portfolio: (holdings: Holding[]) => call<PortfolioOut>("/api/portfolio", post({ holdings })),
  reconcile: (rows: ReadRow[], printed_total: number | null) =>
    call<Reconciled>("/api/import/reconcile", post({ rows, printed_total })),
  screenshot: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<Reconciled>("/api/import/screenshot", { method: "POST", body: form });
  },
};
