"use client";

import { api, ApiError, type SignalResult, type State } from "./api";

// The fund page's shape, as planned for GET /api/funds/{symbol}. Until the backend ships that endpoint, loadFund()
// builds the same shape from endpoints that already exist (portfolio look-through, company prices, today's filings),
// so every number on the page is real. Once /api/funds answers, it is used as-is.

export interface FundHolding {
  ticker: string;
  name: string;
  weight: number; // share of the fund, 0..1
  state: State | null; // null: not tested (small slices)
  firing: SignalResult[];
  lite_line: string | null;
}

export interface FundDetail {
  symbol: string;
  name: string;
  holdings_as_of: string | null;
  holdings_source: string | null;
  looked_through_share: number; // share of the fund split into stocks Stone has data for, 0..1
  holdings: FundHolding[]; // largest first, top 25
  holdings_count: number; // how many holdings Stone could see
  heads_up: FundHolding[];
  performance: { d30: number | null; d90: number | null; y1: number | null; as_of: string | null };
  week_filings: { ticker: string; form: string; accepted_at: string; url: string | null }[];
  filings_span: { start: string; end: string } | null; // the days week_filings covers (one day when only the day block exists)
  fund_state: State | null;
  fund_firing: SignalResult[];
  price: { close: number; day: string; change: number | null } | null;
  built_from: "api" | "existing endpoints";
}

const back = (closes: number[], n: number) => (closes.length > n ? closes[closes.length - 1] / closes[closes.length - 1 - n] - 1 : null);

async function fromExisting(symbol: string): Promise<FundDetail> {
  const co = await api.company(symbol); // throws ApiError 404 for a fund Stone doesn't have
  const p = await api.portfolio([{ symbol, shares: 1 }]);
  const price = p.rows.find((r) => r.symbol === symbol)?.price ?? co.last?.close ?? 0;
  const fund = p.funds.find((f) => f.symbol === symbol);
  const self = p.exposure.find((e) => e.symbol === symbol);

  // One share of the fund: each stock's dollars inside it, divided by the share price, is its weight in the fund.
  const inside: FundHolding[] = price > 0 ? [
    ...p.exposure.filter((e) => e.symbol !== symbol).map((e) => ({
      ticker: e.symbol, name: e.name, weight: (e.via_etf[symbol] ?? 0) / price, state: e.state, firing: e.firing, lite_line: null,
    })),
    ...(self?.children ?? []).map((c) => ({ ticker: c.symbol, name: c.name, weight: c.total / price, state: null, firing: [], lite_line: null })),
  ].filter((h) => h.weight > 0).sort((a, b) => b.weight - a.weight) : [];

  let week: FundDetail["week_filings"] = [];
  let span: FundDetail["filings_span"] = null;
  if (inside.length) {
    try {
      const t = await api.today(inside.slice(0, 10).map((h) => h.ticker));
      const useWeek = !!(t.week && t.holdings?.week_filings);
      week = (useWeek ? t.holdings!.week_filings.items : t.holdings?.filings.items) ?? [];
      span = useWeek ? { start: t.week!.start, end: t.week!.end } : t.day ? { start: t.day, end: t.day } : null;
    } catch {}
  }

  const closes = co.prices.map((x) => x.close);
  return {
    symbol,
    name: co.company.name,
    holdings_as_of: fund?.as_of ?? null,
    holdings_source: fund?.source ?? null,
    looked_through_share: fund?.looked_through ?? 0,
    holdings: inside.slice(0, 25),
    holdings_count: inside.length,
    heads_up: inside.filter((h) => h.state === "WATCH"),
    performance: { d30: back(closes, 21), d90: back(closes, 63), y1: back(closes, 252), as_of: co.last?.day ?? null },
    week_filings: week,
    filings_span: span,
    fund_state: co.state,
    fund_firing: co.signals.filter((s) => s.firing),
    price: co.last,
    built_from: "existing endpoints",
  };
}

export async function loadFund(symbol: string): Promise<FundDetail> {
  const res = await fetch(`/api/funds/${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (res.ok) return { ...(await res.json()), built_from: "api" } as FundDetail;
  if (res.status !== 404) throw new ApiError(res.status, res.statusText);
  return fromExisting(symbol); // endpoint not there yet (or no such fund: fromExisting then throws the 404)
}
