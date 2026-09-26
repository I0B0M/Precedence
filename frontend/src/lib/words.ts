import type { MarketResult, SignalResult } from "./api";
import { horizonWords, whole } from "./format";

/** The signal to talk about first: a proven one that is firing, else any firing one. */
export function headline(signals: SignalResult[]): SignalResult | null {
  return signals.find((s) => s.firing && s.label === "STRONG") ?? signals.find((s) => s.firing) ?? null;
}

export function liteSummary(firing: SignalResult[]): string {
  const strong = firing.find((s) => s.label === "STRONG");
  if (strong?.signal === "market_rate_jump") return "Interest rates jumped, and the whole market has usually fallen after that.";
  if (strong) return `${strong.lite}, and for this stock that has mattered before.`;
  if (firing.length) return `${firing[0].lite}, but that hasn't clearly mattered here before.`;
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

/** "The last 12 times ... it was lower a month later 10 times. In a normal month, about 27%." */
export function liteHistory(s: SignalResult, ticker: string): string {
  const h = horizonWords(s.horizon);
  const span = h.replace("a ", "");
  if (s.n === 0) return `This hasn't happened to ${ticker} in the last two years, so there's nothing to go on.`;
  const what = s.vs_market ? `it ${hitWords(s)} over the next ${span}` : `it was lower ${h} later`;
  return `The last ${s.n} time${s.n > 1 ? "s" : ""} this happened to ${ticker}, ${what} ` +
    `${s.hits} time${s.hits === 1 ? "" : "s"}. In a normal ${span}, that's about ${whole(s.normal_rate)} of the time.`;
}

/** Market card: "After these rate jumps the whole market (SPY) fell 10 of 15 times; in a normal week it falls about 38% of the time." */
export function liteMarket(m: MarketResult): string {
  const span = horizonWords(m.horizon).replace("a ", "");
  return `After these rate jumps the whole market (${m.symbol}) fell ${m.hits} of ${m.n} times; ` +
    `in a normal ${span} it falls about ${whole(m.normal_rate)} of the time.`;
}

export function liteVerdict(s: SignalResult): string {
  if (s.label === "STRONG") return s.signal === "market_rate_jump" ? "That's a real pattern for the whole market." : "That's a real pattern for this stock.";
  if (s.label === "WEAK") return "That's too few times to be sure.";
  return "That's not clearly different from normal.";
}

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
