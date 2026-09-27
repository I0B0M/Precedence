import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PortfolioOut, PortfolioRisk } from "@/lib/api";
import { closingExpert, composeScript, firingExpert, gate, openingExpert, riskExpert, watchExpert, type Candidate } from "../compose";

// The saved board the live demo runs on (real prices and signals at the close on 2026-09-25).
const KEY = "AAPL-10_AMZN-10_BX-10_JPM-10_NVDA-10_SPY-5";
const board = JSON.parse(readFileSync(`public/saved/portfolio/${KEY}.json`, "utf8")) as PortfolioOut;
const risk = JSON.parse(readFileSync(`public/saved/portfolio/risk/${KEY}.json`, "utf8")) as PortfolioRisk;

describe("composeScript on the saved board", () => {
  const script = composeScript({ portfolio: board, risk });

  it("opens with the total and closes with the disclaimer, in that order", () => {
    expect(script.lines[0].text).toMatch(/^Everything you own is worth \$16,627 at the close on Sep 25, 2026/);
    expect(script.lines[script.lines.length - 1].text).toMatch(/Stone never places an order\.$/);
  });

  it("says Heads up for AMZN and SPY with the numbers Lite shows", () => {
    const amzn = script.lines.find((l) => l.ticker === "AMZN" && l.tone === "watch");
    expect(amzn?.text).toBe("AMZN is Heads up: executives sold shares, and the last 12 times that happened to AMZN, it was lower a month later 6 times, against 26% in a normal month.");
    expect(amzn?.cites).toEqual(["signal:insider_cluster", "price:2026-09-03"]);
    expect(amzn?.link).toBe("/lab?t=AMZN&s=insider_cluster");
    const spy = script.lines.find((l) => l.ticker === "SPY");
    expect(spy?.text).toBe("SPY is Heads up: interest rates jumped, and after the last 15 jumps the whole market fell 10 times, against 38% in a normal week.");
    expect(spy?.cites[0]).toBe("market:rate_jump");
  });

  it("speaks tickers as names and symbols as words", () => {
    const spy = script.lines.find((l) => l.ticker === "SPY");
    expect(spy?.say).toBe("the S and P 500 fund is Heads up: interest rates jumped, and after the last 15 jumps the whole market fell 10 times, against 38 percent in a normal week.");
    expect(script.lines[0].say).toMatch(/16,627 dollars/);
  });

  it("groups the unproven rate jump into one line and NVDA's insider selling into its own", () => {
    const grouped = script.lines.find((l) => l.cites.includes("signal:rate_jump"));
    expect(grouped?.text).toBe("Interest rates jumped for AAPL, JPM, NVDA, BX and MSFT too, but for none of them has it clearly mattered before.");
    const nvda = script.lines.find((l) => l.ticker === "NVDA" && l.cites.includes("signal:insider_cluster"));
    expect(nvda?.text).toMatch(/^NVDA: executives sold shares, but the last 13 times that happened to NVDA, it was lower a month later 5 times, against 36% in a normal month/);
  });

  it("tells the risk story from the QuantStats card", () => {
    const dd = script.lines.find((l) => l.cites.includes("risk:max_drawdown"));
    expect(dd?.text).toBe("Your worst drop from a high in the last two years was 24.7%, about $4,111 at today's total, from Feb 19, 2025 to Apr 8, 2025.");
    const beta = script.lines.find((l) => l.cites.includes("risk:beta"));
    expect(beta?.text).toBe("This mix moves more than the market: about 1.2 times the S&P 500's daily moves.");
  });

  it("names the biggest company once the fund is opened up", () => {
    const lt = script.lines.find((l) => l.cites.includes("fund:SPY"));
    expect(lt?.text).toBe("Once SPY is opened up, AAPL is your biggest company at 22% of everything, because you own it directly and inside the fund.");
  });

  it("reports which experts spoke and stays within the limit", () => {
    expect(script.lines.length).toBeLessThanOrEqual(10);
    expect(script.panel.experts.map((e) => e.name)).toEqual(["Opening", "Heads up", "Firing, not proven", "Risk", "Look-through", "Bad day", "Closing"]);
    expect(script.panel.experts.find((e) => e.name === "Heads up")?.spoken).toBe(2);
    expect(new Set(script.lines.map((l) => l.id)).size).toBe(script.lines.length);
    expect(script.generated_by).toBe("experts (browser)");
    expect(script.as_of).toBe("2026-09-25");
  });

  it("is deterministic", () => {
    expect(composeScript({ portfolio: board, risk })).toEqual(script);
  });
});

describe("the experts on edge cases", () => {
  const empty: PortfolioOut = { total: 0, rows: [], exposure: [], unknown: [], funds: [], price_as_of: null, retirement: [], properties: [],
    subtotals: { investments: 0, retirement: 0, home_estimate: 0, total: 0, includes_home_estimate: false } };

  it("opening and closing still speak on an empty board, and never divide by zero", () => {
    const s = composeScript({ portfolio: empty, risk: null });
    expect(s.lines.map((l) => l.text)).toEqual([
      "Everything you own is worth $0 at the latest close.",
      "Nothing needs you today. That's the briefing. Nothing here is advice, and Stone never places an order.",
    ]);
    expect(openingExpert({ portfolio: empty, risk: null }, {})[0].text).not.toMatch(/NaN|Infinity/);
  });

  it("skips today's move when any row lacks a change", () => {
    const p = { ...board, rows: board.rows.map((r, i) => (i === 0 ? { ...r, change: null } : r)) };
    expect(openingExpert({ portfolio: p, risk: null }, {})[0].text).not.toMatch(/on the day/);
  });

  it("watch expert says nothing when nothing is on WATCH", () => {
    const p = { ...board, exposure: board.exposure.map((e) => ({ ...e, state: "CALM" as const })) };
    expect(watchExpert({ portfolio: p, risk: null }, {})).toEqual([]);
    expect(closingExpert({ portfolio: p, risk: null }, {})[0].text).toMatch(/^Nothing needs you today/);
  });

  it("firing expert handles a single stock without the word 'too'", () => {
    const only = board.exposure.filter((e) => e.symbol === "BX");
    const p = { ...board, exposure: only };
    const [line] = firingExpert({ portfolio: p, risk: null }, {});
    expect(line.text).toMatch(/^BX: interest rates jumped, but the last 15 times that happened to BX, it did worse than the whole market over the next week 8 times, against 51% in a normal week/);
  });

  it("risk expert leaves out beta when it is null", () => {
    const r = { ...risk, portfolio: { ...risk.portfolio, beta: null } };
    expect(riskExpert({ portfolio: board, risk: r }, {}).map((c) => c.cites[0])).toEqual(["risk:max_drawdown"]);
  });
});

describe("gate", () => {
  const c = (over: Partial<Candidate>): Candidate => ({
    priority: 0, expert: "X", tone: "note", ticker: null, text: "t", cites: [], ...over,
  });

  it("orders by priority and keeps the closing line last past the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => c({ priority: i, text: `line ${i}` }));
    const closing = c({ priority: 99, expert: "Closing", text: "bye" });
    const { lines, held } = gate([closing, ...many], 5);
    expect(lines.map((l) => l.text)).toEqual(["line 0", "line 1", "line 2", "line 3", "bye"]);
    expect(held.length).toBe(8);
    expect(held.every((h) => h.reason.includes("limit"))).toBe(true);
  });

  it("holds back a calm line about a holding already covered by a Heads up line", () => {
    const { lines, held } = gate([
      c({ priority: 1, tone: "watch", ticker: "AMZN", text: "amzn watch" }),
      c({ priority: 2, tone: "calm", ticker: "AMZN", text: "amzn calm" }),
    ]);
    expect(lines.map((l) => l.text)).toEqual(["amzn watch"]);
    expect(held[0].reason).toBe("AMZN already covered by a Heads up line");
  });
});
