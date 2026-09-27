import type { Label, MarketResult, SignalResult } from "./api";
import { horizonWords } from "./format";

/** The signal to talk about first: a STRONG one that is firing, else any firing one. */
export function headline(signals: SignalResult[]): SignalResult | null {
  return signals.find((s) => s.firing && s.label === "STRONG") ?? signals.find((s) => s.firing) ?? null;
}

// Lite copy: one short line per item, 10 words at most, no labels, dates, ranges or normal rates.
// Pro copy can stay detailed.

/** Classic's four verdicts, word for word. Classic never shows the label itself (STRONG, NOT PROVEN, WEAK). */
export function liteVerdict(s: { label: Label }, ticker: string): string {
  if (s.label === "STRONG") return `This has mattered for ${ticker} before.`;
  if (s.label === "NOT PROVEN") return `No clear pattern for ${ticker}.`;
  if (s.label === "WEAK") return "Too few times to tell.";
  return "Not tested yet.";
}

/** One row's line: what is happening now, then the verdict. "Executives sold shares. This has mattered for AMZN before." */
export function liteSummary(firing: SignalResult[], ticker: string): string {
  const s = firing.find((x) => x.label === "STRONG") ?? firing[0];
  return s ? `${s.lite}. ${liteVerdict(s, ticker)}` : "Nothing important today.";
}

export function proSummary(firing: SignalResult[]): string {
  if (!firing.length) return "No signals firing";
  const proven = firing.filter((s) => s.label === "STRONG").length;
  return `${firing.length} signal${firing.length > 1 ? "s" : ""} firing · ${proven ? `${proven} STRONG` : "none STRONG"}`;
}

/** What a hit means for this signal. A rate jump hits every stock at once, so there it is measured against the market. */
export function hitWords(s: { vs_market: boolean }): string {
  return s.vs_market ? "did worse than the whole market (SPY)" : "was lower";
}

/** "8 of the last 15 times, BX did worse than the market." */
export function liteHistory(s: SignalResult, ticker: string): string {
  if (s.label === "NO DATA") return s.note ?? "This data isn't loaded yet, so it wasn't tested.";
  const h = horizonWords(s.horizon);
  if (s.n === 0) return `This hasn't happened to ${ticker} in two years.`;
  const what = s.vs_market ? "did worse than the market" : `was lower ${h} later`;
  if (s.n === 1) return `Happened once, and ${ticker} ${s.hits ? what : s.vs_market ? "kept up with the market" : "wasn't lower"}.`;
  return `${s.hits} of the last ${s.n} times, ${ticker} ${what}.`;
}

/** When the two hold-out halves hold fewer cases than the whole test, say by how many; the counts only, no reason given. */
export const splitGap = (s: SignalResult) => {
  const h = s.holdout;
  if (!h) return "";
  const n = h.first.n + h.second.n, hits = h.first.hits + h.second.hits;
  if (n === s.n) return "";
  const x = h.excluded;
  return x?.reason
    ? `; ${x.n} case${x.n === 1 ? "" : "s"} (${x.hits} hit${x.hits === 1 ? "" : "s"}) in neither half. ${x.reason}`
    : `; the halves hold ${n} of the ${s.n} cases and ${hits} of the ${s.hits} hits`;
};

/** Pro, beside a STRONG result: what the stricter checks say, from the backend's own fields. Null when they don't
 *  apply or passed. A STRONG verdict describes the past; this line keeps it from reading as proven. */
export function proCaveat(s: { label: Label; fdr10_survives?: boolean | null; holdout?: SignalResult["holdout"] }): string | null {
  if (s.label !== "STRONG") return null;
  const parts: string[] = [];
  if (s.fdr10_survives === false) parts.push("doesn't survive the correction");
  const h = s.holdout;
  const v = h ? h.verdict ?? (h.held_up === true ? "held up" : h.held_up === false ? "did not hold" : "too few cases to check") : null;
  if (v === "too few cases to check") parts.push("too few cases in each half");
  else if (v === "did not hold") parts.push("didn't hold up in both halves");
  if (!parts.length) return null;
  const t = parts.join(" · ");
  return t[0].toUpperCase() + t.slice(1);
}

/** Market card: "The market fell a week after 10 of 15 rate jumps." */
export function liteMarket(m: MarketResult): string {
  return `The market fell ${horizonWords(m.horizon)} after ${m.hits} of ${m.n} rate jumps.`;
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
  "8-K": "Company news",
  "10-K/A": "Annual report (corrected)",
  "10-Q/A": "Quarterly report (corrected)",
  "8-K/A": "Company news (corrected)",
  "4": "Insider trade",
  "4/A": "Insider trade (corrected)",
  "S-1": "Offering document",
  "DEF 14A": "Shareholder meeting notice",
};
