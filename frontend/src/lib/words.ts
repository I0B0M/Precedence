import type { MarketResult, SignalResult } from "./api";
import { horizonWords, whole } from "./format";

/** The signal to talk about first: a proven one that is firing, else any firing one. */
export function headline(signals: SignalResult[]): SignalResult | null {
  return signals.find((s) => s.firing && s.label === "STRONG") ?? signals.find((s) => s.firing) ?? null;
}

// Lite copy: one short sentence each, plain words, about 14 words at most. Pro copy can stay detailed.

export function liteSummary(firing: SignalResult[]): string {
  const strong = firing.find((s) => s.label === "STRONG");
  if (strong?.signal === "market_rate_jump") return "Rates jumped, and the market usually fell after that.";
  if (strong) return `${strong.lite}, and that has mattered here before.`;
  if (firing.length) return `${firing[0].lite}, but that hasn't clearly mattered here.`;
  return "Nothing important today.";
}

export function proSummary(firing: SignalResult[]): string {
  if (!firing.length) return "No signals firing";
  const proven = firing.filter((s) => s.label === "STRONG").length;
  return `${firing.length} signal${firing.length > 1 ? "s" : ""} firing · ${proven ? `${proven} proven` : "none proven"}`;
}

/** What a hit means for this signal. A rate jump hits every stock at once, so there it is measured against the market. */
export function hitWords(s: { vs_market: boolean }): string {
  return s.vs_market ? "did worse than the whole market (SPY)" : "was lower";
}

/** "8 of the last 15 times, BX did worse than the market (normal: 51%)." */
export function liteHistory(s: SignalResult, ticker: string): string {
  if (s.label === "NO DATA") return s.note ?? "This data isn't loaded yet, so it wasn't tested.";
  const h = horizonWords(s.horizon);
  if (s.n === 0) return `This hasn't happened to ${ticker} in two years.`;
  const what = s.vs_market ? "did worse than the market" : `was lower ${h} later`;
  if (s.n === 1) return `Happened once, and ${ticker} ${s.hits ? what : s.vs_market ? "kept up with the market" : "wasn't lower"}.`;
  return `${s.hits} of the last ${s.n} times, ${ticker} ${what} (normal: ${whole(s.normal_rate)}).`;
}

/** Market card: "The market fell after 10 of 15 rate jumps (normal week: 38%)." */
export function liteMarket(m: MarketResult): string {
  const span = horizonWords(m.horizon).replace("a ", "");
  return `The market fell after ${m.hits} of ${m.n} rate jumps (normal ${span}: ${whole(m.normal_rate)}).`;
}

export function liteVerdict(s: SignalResult): string {
  if (s.label === "STRONG") return "Has mattered before.";
  if (s.label === "NO DATA") return "";
  if (s.label === "WEAK") return "Too few cases to tell.";
  return "Not proven. Could be chance.";
}

/** Signal keys in plain words, for places that get only the key (e.g. fund holdings). */
export const SIGNAL_WORDS: Record<string, string> = {
  insider_cluster: "Insider selling",
  rate_jump: "Rate jump",
  gap_down: "5% drop at the open",
  market_rate_jump: "Rate jump (whole market)",
};

export const FORM_WORDS: Record<string, string> = {
  "10-K": "Annual report",
  "10-Q": "Quarterly report",
  "8-K": "Company news (8-K)",
  "10-K/A": "Annual report (corrected)",
  "10-Q/A": "Quarterly report (corrected)",
  "8-K/A": "Company news (corrected)",
  "4": "Insider trade",
  "4/A": "Insider trade (corrected)",
  "S-1": "Offering document (S-1)",
  "DEF 14A": "Shareholder meeting notice",
};
