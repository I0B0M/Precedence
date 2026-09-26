import type { SignalResult } from "./api";
import { horizonWords, whole } from "./format";

/** The signal to talk about first: a proven one that is firing, else any firing one. */
export function headline(signals: SignalResult[]): SignalResult | null {
  return signals.find((s) => s.firing && s.label === "STRONG") ?? signals.find((s) => s.firing) ?? null;
}

export function liteSummary(firing: SignalResult[]): string {
  const strong = firing.find((s) => s.label === "STRONG");
  if (strong) return `${strong.lite}, and for this stock that has mattered before.`;
  if (firing.length) return `${firing[0].lite}, but that hasn't clearly mattered here before.`;
  return "Nothing important today.";
}

export function proSummary(firing: SignalResult[]): string {
  if (!firing.length) return "No signals firing";
  const proven = firing.filter((s) => s.label === "STRONG").length;
  return `${firing.length} signal${firing.length > 1 ? "s" : ""} firing · ${proven ? `${proven} proven` : "none proven"}`;
}

/** "The last 12 times ... it was lower a month later 10 times. In a normal month, about 27%." */
export function liteHistory(s: SignalResult, ticker: string): string {
  const h = horizonWords(s.horizon);
  if (s.n === 0) return `This hasn't happened to ${ticker} in the last two years, so there's nothing to go on.`;
  return `The last ${s.n} time${s.n > 1 ? "s" : ""} this happened to ${ticker}, it was lower ${h} later ` +
    `${s.hits} time${s.hits === 1 ? "" : "s"}. In a normal ${h.replace("a ", "")}, that's about ${whole(s.normal_rate)} of the time.`;
}

export function liteVerdict(s: SignalResult): string {
  if (s.label === "STRONG") return "That's a real pattern for this stock.";
  if (s.label === "WEAK") return "That's too few times to be sure.";
  return "That's not clearly different from normal.";
}

export const FORM_WORDS: Record<string, string> = {
  "10-K": "Annual report",
  "10-Q": "Quarterly report",
  "8-K": "Company news (8-K)",
  "4": "Insider trade",
  "DEF 14A": "Shareholder meeting notice",
};
