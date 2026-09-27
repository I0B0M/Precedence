import { describe, expect, it } from "vitest";
import type { SignalResult } from "../api";
import { afterNews, dayEventWords, recentNews } from "../company";

const sig = (o: Partial<SignalResult>): SignalResult => ({
  signal: "insider_cluster", lite: "Insiders sold shares", pro: "", horizon: 20, vs_market: false, n: 12, hits: 6,
  hit_rate: 0.5, normal_n: 125, normal_hits: 32, normal_rate: 32 / 125, low: 0.29, high: 0.71, label: "STRONG",
  firing: null, holdout: null, ...o,
});

describe("afterNews: what happened after news like this, never what will happen", () => {
  it("says the counts and the normal count, in plain words", () => {
    expect(afterNews(sig({}), "AMZN")).toEqual({
      line: "After insiders sold, AMZN fell in 6 of 12 cases; about 3 is normal.", verdict: "Not proven." });
    expect(afterNews(sig({ signal: "rate_jump", vs_market: true, n: 15, hits: 8, normal_rate: 0.51, label: "NOT PROVEN" }), "BX"))
      .toEqual({ line: "After interest rates jumped, BX did worse than the market in 8 of 15 cases; about 8 is normal.",
        verdict: "No clear pattern." });
    expect(afterNews(sig({ n: 2, hits: 1, label: "WEAK" }), "BX")!.verdict).toBe("Too few cases to tell.");
    expect(afterNews(sig({ n: 1, hits: 1, label: "WEAK" }), "BX")!.line).toContain("in 1 of 1 case;");
  });

  it("skips what wasn't tested and says so when it never happened", () => {
    expect(afterNews(sig({ label: "NO DATA", n: 0 }), "ABBV")).toBeNull();
    expect(afterNews(sig({ n: 0, hits: 0, label: "WEAK" }), "BX")!.line).toBe(
      "After insiders sold: it hasn't happened to BX in two years.");
  });

  it("never predicts", () => {
    for (const label of ["STRONG", "NOT PROVEN", "WEAK"] as const) {
      const w = afterNews(sig({ label }), "AMZN")!;
      expect(`${w.line} ${w.verdict}`).not.toMatch(/\b(will|predict|forecast|expect|likely)\b/i);
    }
  });
});

describe("recentNews: filings and insider sales, one dated list", () => {
  const d = {
    filings: [
      { accession: "a1", form: "10-Q", filed_date: "2026-07-31", accepted_at: "2026-07-31T16:05:00-04:00", report_date: null, url: "u1" },
      { accession: "a2", form: "8-K", filed_date: "2026-09-02", accepted_at: "2026-09-02T08:00:00-04:00", report_date: null, url: null },
    ],
    insider_sales: [
      { accession: "f4", seq: 1, accepted_at: "2026-09-03T16:42:02-04:00", owner_name: "Herrington Douglas J", owner_title: "CEO Worldwide Stores",
        transaction_date: "2026-09-01", shares: 600, price: 230, url: "u4" },
      { accession: "f4", seq: 2, accepted_at: "2026-09-03T16:42:02-04:00", owner_name: "Herrington Douglas J", owner_title: "CEO Worldwide Stores",
        transaction_date: "2026-09-01", shares: 400, price: 231, url: "u4" },
    ],
  };

  it("merges, newest first, and adds up a Form 4's lines", () => {
    const n = recentNews(d);
    expect(n.map((x) => x.key)).toEqual(["f4", "a2", "a1"]);
    expect(n[0]).toMatchObject({ title: "Douglas J Herrington sold 1,000 shares", detail: "CEO Worldwide Stores · Form 4", url: "u4" });
    expect(n[1]).toMatchObject({ title: "Company news", url: null });
    expect(n[2]).toMatchObject({ title: "Quarterly report", url: "u1" });
    expect(recentNews(d, 2)).toHaveLength(2);
  });

  it("names each big day's events in plain words", () => {
    expect(dayEventWords({ kind: "filing", form: "10-Q", accepted_at: "x", url: null })).toBe("Quarterly report");
    expect(dayEventWords({ kind: "insider_sale", accession: "f", accepted_at: "x", owner_name: "Herrington Douglas J",
      owner_title: null, shares: 10000, url: null })).toBe("Douglas J Herrington sold 10,000 shares");
    expect(dayEventWords({ kind: "rate_jump", known_at: "x", note: "2026-03-24: 10-year yield 4.39%, up 0.19 pt in a week" }))
      .toBe("10-year yield up 0.19 points in a week");
  });
});
