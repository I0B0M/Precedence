"use client";

import { api, type FundHolding, type FundPage } from "./api";
import { liteSummary } from "./words";

// The fund page reads GET /api/funds/{symbol} (api.fund). Until that endpoint is live, loadFund() builds the same
// FundPage shape from endpoints that already exist (portfolio look-through, company prices, today's filings), so every
// number on the page is real either way. `built_from` says which, so the page can word counts honestly.

export type FundView = FundPage & {
  built_from: "api" | "existing endpoints";
  price_change: number | null; // last day's move, when known (the fund endpoint doesn't send it)
};

const back = (closes: number[], n: number) => (closes.length > n ? closes[closes.length - 1] / closes[closes.length - 1 - n] - 1 : null);

async function fromExisting(symbol: string): Promise<FundView> {
  const co = await api.company(symbol); // throws ApiError 404 for a fund Stone doesn't have
  const p = await api.portfolio([{ symbol, shares: 1 }]);
  const price = p.rows.find((r) => r.symbol === symbol)?.price ?? co.last?.close ?? 0;
  const fund = p.funds.find((f) => f.symbol === symbol);
  const self = p.exposure.find((e) => e.symbol === symbol);

  // One share of the fund: each stock's dollars inside it, divided by the share price, is its weight in the fund.
  const inside: FundHolding[] = price > 0 ? [
    ...p.exposure.filter((e) => e.symbol !== symbol).map((e) => ({
      ticker: e.symbol, name: e.name, weight: (e.via_etf[symbol] ?? 0) / price, in_stone: true, state: e.state,
      firing: e.firing.map((s) => ({ signal: s.signal, label: s.label })), lite_line: e.firing.length ? liteSummary(e.firing) : null,
    })),
    ...(self?.children ?? []).map((c) => ({
      ticker: c.symbol, name: c.name, weight: c.total / price, in_stone: true, state: null, firing: [], lite_line: null,
    })),
  ].filter((h) => h.weight > 0).sort((a, b) => b.weight - a.weight) : [];

  let week: FundPage["week_filings"] = [];
  let span: FundPage["filings_span"] = null;
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
    price: co.last ? { last_close: co.last.close, as_of: co.last.day } : null,
    price_change: co.last?.change ?? null,
    performance: { d30: back(closes, 21), d90: back(closes, 63), y1: back(closes, 252), as_of: co.last?.day ?? null },
    fund_state: co.state,
    fund_firing: co.signals.filter((s) => s.firing),
    holdings_as_of: fund?.as_of ?? null,
    holdings_source: fund?.source ?? null,
    total_holdings_count: inside.length, // only what Stone can see; the page words it that way
    looked_through_share: fund?.looked_through ?? 0,
    holdings: inside.slice(0, 25),
    heads_up: inside.filter((h) => h.state === "WATCH").map((h) => ({ ticker: h.ticker, name: h.name ?? h.ticker, weight: h.weight })),
    filings_span: span,
    week_filings: week,
    note: inside.length ? null : `Holdings for ${symbol} aren't loaded yet.`,
    built_from: "existing endpoints",
  };
}

export async function loadFund(symbol: string): Promise<FundView> {
  try {
    return { ...(await api.fund(symbol)), built_from: "api", price_change: null };
  } catch (e) {
    // 404 means the endpoint isn't live yet (or there's no such fund, in which case fromExisting throws the 404).
    if ((e as { status?: number }).status === 404) return fromExisting(symbol);
    throw e;
  }
}
