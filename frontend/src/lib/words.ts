import type { Label, MarketResult, SignalResult } from "./api";
import { horizonWords } from "./format";
import { LITE_STRONG_WORDING } from "./flags";

const NOT_PROVEN_WORDS = LITE_STRONG_WORDING === "not-proven";

/** The signal to talk about first: a STRONG one that is firing, else any firing one. */
export function headline(signals: SignalResult[]): SignalResult | null {
  return signals.find((s) => s.firing && s.label === "STRONG") ?? signals.find((s) => s.firing) ?? null;
}

// Lite copy: one short line per item, 10 words at most, no labels, dates, ranges or normal rates.
// Pro copy can stay detailed.

/** Classic's four verdicts, word for word. Classic never shows the label itself (STRONG, NOT PROVEN, WEAK). */
export function liteVerdict(s: { label: Label }, ticker: string): string {
  if (s.label === "STRONG") return NOT_PROVEN_WORDS ? "This has come before drops here. Not proven." : `This has mattered for ${ticker} before.`;
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

/** STRONG by Precedence's rule, but a stricter test that also counts the normal rate's uncertainty doesn't clear it. */
export function isBorderline(s: { label: Label; strict?: SignalResult["strict"] }): boolean {
  return s.label === "STRONG" && s.strict != null && s.strict.p >= 0.05;
}

/** Pro, beside a STRONG result: what the stricter checks say, from the backend's own fields. Null when they don't
 *  apply or passed. A STRONG verdict describes the past; this line keeps it from reading as proven. */
export function proCaveat(s: { label: Label; fdr10_survives?: boolean | null; holdout?: SignalResult["holdout"]; strict?: SignalResult["strict"] }): string | null {
  if (s.label !== "STRONG") return null;
  const parts: string[] = [];
  if (isBorderline(s)) parts.push("borderline: the stricter test doesn't clear it");
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

/** A fund's one line: its own signal if one is firing, else how many of its holdings have a Heads up. */
export function fundLine(f: { symbol: string; fund_firing: SignalResult[]; heads_up: unknown[]; holdings: unknown[] }): string {
  if (f.fund_firing.length) return liteSummary(f.fund_firing, f.symbol);
  const n = f.heads_up.length;
  if (n) return `${n} of its holdings ${n > 1 ? "have" : "has"} a Heads up.`;
  return f.holdings.length ? "A fund: many stocks in one." : "What's inside isn't loaded yet.";
}

/** "2 have mattered before" / "2 have come before drops": how many STRONG results are firing (LITE_STRONG_WORDING). */
export function strongCountWords(n: number, forYourHoldings = false): string {
  const verb = n === 1 ? "has" : "have";
  if (NOT_PROVEN_WORDS) return `${n} ${verb} come before drops${forYourHoldings ? " for your holdings" : ""}`;
  return `${n} ${verb} mattered before${forYourHoldings ? " for your holdings" : ""}`;
}

/** The home and start-screen promise, in the same wording as the verdicts. */
export const PROMISE_WORDS = NOT_PROVEN_WORDS
  ? { hero: "And whether that kind of news has come before a drop for that stock.", start: "and whether it has come before a drop." }
  : { hero: "And whether that kind of news has ever mattered for that stock.", start: "and whether it has ever mattered." };

/** Learn, the STRONG illustration and the WATCH badge, in the same wording. */
export const LEARN_STRONG = NOT_PROVEN_WORDS
  ? { figure: "This has come before drops. Not proven.", watch: "Something that has come before drops for this stock is happening now.",
      calm: "Nothing that has come before drops is happening." }
  : { figure: "This has mattered before.", watch: "Something that has mattered for this stock before is happening now.",
      calm: "Nothing that has mattered before is happening." };

/** A Form 4 owner as people say it: the SEC files people as "Last First Middle" ("Herrington Douglas J" → "Douglas J
 *  Herrington"), often in all caps ("FINK LAURENCE" → "Laurence Fink"). Anything that looks like a company or
 *  trust is left exactly as filed. */
export function personName(filed: string | null): string | null {
  if (!filed) return null;
  if (/\b(LLC|L\.?P\.?|INC|CORP|TRUST|FUND|HOLDINGS|PARTNERS|CAPITAL|FOUNDATION|LTD|CO)\b/i.test(filed)) return filed;
  const parts = filed.trim().split(/\s+/);
  const reordered = parts.length > 1 ? [...parts.slice(1), parts[0]].join(" ") : filed;
  const allCaps = /[A-Z]/.test(reordered) && !/[a-z]/.test(reordered);
  return allCaps ? reordered.replace(/[A-Za-z]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : reordered;
}

/** Signal keys in plain words, for places that get only the key (e.g. fund holdings). */
export const SIGNAL_WORDS: Record<string, string> = {
  insider_cluster: "Insider selling",
  rate_jump: "Rate jump",
  gap_down: "5% drop at the open",
  market_rate_jump: "Rate jump (whole market)",
};

const EVENT_ROW_WORDS: Record<string, string> = {
  insider_cluster: "After insiders sold",
  rate_jump: "After a rate jump",
  gap_down: "After a drop",
  market_rate_jump: "After a rate jump",
};

const QUESTION_WORDS: Record<string, (ticker: string, vsMarket: boolean) => string> = {
  insider_cluster: (t) => `After insiders sold, did ${t} fall?`,
  rate_jump: (t, vsMarket) => (vsMarket ? `When rates jumped, did ${t} lag the market?` : `When rates jumped, did ${t} fall?`),
  gap_down: (t) => `After a drop, did ${t} fall further?`,
  market_rate_jump: (t) => `When rates jumped, did ${t} fall?`,
};

/** Signals Lite: the section's heading, as a question. "When rates jumped, did BX lag the market?" */
export function liteQuestion(signal: string, ticker: string, vsMarket: boolean): string {
  return (QUESTION_WORDS[signal] ?? ((t: string) => `Has this happened to ${t} before?`))(ticker, vsMarket);
}

/** Signals Lite: the event row's label. "After a rate jump". */
export function eventRowWords(signal: string): string {
  return EVENT_ROW_WORDS[signal] ?? "After this happened";
}

/** How the event rate compares with the normal rate: the only four buckets the Lite answer line uses. */
export function freqWords(hitRate: number, normalRate: number): string {
  if (normalRate <= 0) return hitRate > 0 ? "More often than usual" : "Same as usual";
  const ratio = hitRate / normalRate;
  if (ratio >= 1.75) return "Twice as often as usual";
  if (ratio >= 1.25) return "More often than usual";
  if (ratio <= 0.8) return "Less often than usual";
  return "Same as usual";
}

/** Signals Lite: the one-line answer under the two rows. "Same as usual. No clear pattern." */
export function liteAnswer(s: SignalResult): string {
  const tag = s.label === "STRONG" ? (NOT_PROVEN_WORDS ? "Not proven." : "Has mattered before.")
    : s.label === "NOT PROVEN" ? "No clear pattern."
    : s.label === "WEAK" ? "Too few times to tell."
    : "Not tested yet.";
  if (!s.n || s.hit_rate == null || s.normal_rate == null) return tag;
  return `${freqWords(s.hit_rate, s.normal_rate)}. ${tag}`;
}

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
