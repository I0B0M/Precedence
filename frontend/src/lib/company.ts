// The stock page's plain words: what happened after news like this, and the latest news in one list.
// Facts and counts only. Nothing here says what a stock will do.
import type { CompanyDetail, DayEvent, SignalResult } from "./api";
import { LITE_STRONG_WORDING } from "./flags";
import { FORM_WORDS, personName } from "./words";

const AFTER: Record<string, string> = {
  insider_cluster: "After insiders sold",
  rate_jump: "After interest rates jumped",
  gap_down: "After a 5% drop at the open",
  market_rate_jump: "After interest rates jumped",
};

/** The verdict in Lite words, the same ones as liteVerdict / liteAnswer. */
export function verdictWords(label: SignalResult["label"]): string {
  if (label === "STRONG") return LITE_STRONG_WORDING === "not-proven" ? "Not proven." : "It has mattered before.";
  if (label === "NOT PROVEN") return "No clear pattern.";
  if (label === "WEAK") return "Too few cases to tell.";
  return "Not tested yet.";
}

/** "After insiders sold, AMZN fell in 6 of 12 cases; about 3 is normal." null for a signal whose data isn't loaded. */
export function afterNews(s: SignalResult, ticker: string): { line: string; verdict: string } | null {
  if (s.label === "NO DATA") return null;
  const lead = AFTER[s.signal] ?? "After this happened";
  if (!s.n) return { line: `${lead}: it hasn't happened to ${ticker} in two years.`, verdict: verdictWords(s.label) };
  const moved = s.vs_market ? "did worse than the market" : "fell";
  const cases = `${s.hits} of ${s.n} case${s.n === 1 ? "" : "s"}`;
  const normal = s.normal_rate == null ? "" : `; about ${Math.round(s.normal_rate * s.n)} is normal`;
  return { line: `${lead}, ${ticker} ${moved} in ${cases}${normal}.`, verdict: verdictWords(s.label) };
}

// Filings that get a plain-words summary (Gemini, figures checked against XBRL).
export const SUMMARY_FORMS = new Set(["8-K", "10-Q", "10-K"]);

export interface NewsItem {
  key: string;
  at: string; // when it became public (SEC acceptance)
  title: string;
  detail: string | null;
  url: string | null;
  kind: "filing" | "insider_sale";
  form: string;
}

const shares = (n: number | null) => (n && n > 0 ? `${n.toLocaleString("en-US")} shares` : "shares");

/** The latest filings and Form 4 sales as one dated list, newest first. A Form 4's sale lines are added up. */
export function recentNews(d: Pick<CompanyDetail, "filings" | "insider_sales">, limit = 8): NewsItem[] {
  const filings: NewsItem[] = d.filings.map((f) => ({
    key: f.accession, at: f.accepted_at, title: FORM_WORDS[f.form] ?? f.form, detail: f.form, url: f.url, kind: "filing", form: f.form,
  }));
  const byForm4 = new Map<string, { item: NewsItem; n: number }>();
  for (const s of d.insider_sales) {
    const got = byForm4.get(s.accession);
    const n = (got?.n ?? 0) + (s.shares ?? 0);
    const who = personName(s.owner_name) ?? "An insider";
    byForm4.set(s.accession, { n, item: {
      key: s.accession, at: got && got.item.at < s.accepted_at ? got.item.at : s.accepted_at, kind: "insider_sale", form: "4",
      title: `${who} sold ${shares(n)}`, detail: s.owner_title ? `${s.owner_title} · Form 4` : "Form 4",
      url: s.url ?? got?.item.url ?? null,
    } });
  }
  const sales = [...byForm4.values()].map((x) => x.item);
  return [...filings, ...sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** One event beside a big day, in plain words: "Quarterly report", "Douglas J Herrington sold 10,000 shares". */
export function dayEventWords(e: DayEvent): string {
  if (e.kind === "filing") return FORM_WORDS[e.form] ?? e.form;
  if (e.kind === "insider_sale") return `${personName(e.owner_name) ?? "An insider"} sold ${shares(e.shares)}`;
  const m = /up (\d+\.\d+) pt/.exec(e.note);
  return m ? `10-year yield up ${m[1]} points in a week` : "10-year yield jumped";
}
