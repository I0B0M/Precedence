import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SAVED_AS_OF, SAVED_EXAMPLE, SAVED_TICKERS, savedFile, savedKey } from "../api";
import { shortDate } from "../format";

// The saved-data demo (Netlify) answers every call from frontend/public/saved, which backend/scripts/build_saved.py
// writes. These tests go through the api module the pages use, so a file the builder names differently fails here.
const KEY = "AAPL-10_AMZN-10_BX-10_JPM-10_NVDA-10_SPY-5";
const disk = (url: string) => `public${url}`;
const index = JSON.parse(readFileSync("public/saved/index.json", "utf8"));
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

describe("savedFile: where the saved data keeps each answer", () => {
  it("maps GET routes to their file, with ?symbols= sorted and upper-cased", () => {
    expect(savedFile("/api/companies/BX")).toBe("/saved/companies/BX.json");
    expect(savedFile("/api/companies/BX/today")).toBe("/saved/companies/BX/today.json");
    expect(savedFile("/api/today")).toBe("/saved/today.json");
    expect(savedFile(`/api/today?symbols=${encodeURIComponent("spy,BX, aapl,bx")}`)).toBe("/saved/today/AAPL,BX,SPY.json");
  });

  it("keys a POST on its holdings, in any order", () => {
    const shuffled = [...SAVED_EXAMPLE].reverse().map((h) => ({ ...h, symbol: h.symbol.toLowerCase() }));
    expect(savedFile("/api/portfolio", post({ holdings: shuffled }))).toBe(`/saved/portfolio/${KEY}.json`);
    expect(savedFile("/api/portfolio/risk", post({ holdings: SAVED_EXAMPLE }))).toBe(`/saved/portfolio/risk/${KEY}.json`);
    expect(savedFile("/api/briefing/portfolio", post({ holdings: SAVED_EXAMPLE }))).toBe(`/saved/briefing/portfolio/${KEY}.json`);
  });

  it("answers 503 for what only the backend can do", () => {
    const needsBackend = expect.objectContaining({ status: 503 });
    expect(() => savedFile("/api/import/reconcile", post({ rows: [], printed_total: 0 }))).toThrow(needsBackend);
    expect(() => savedFile("/api/import/screenshot", { method: "POST", body: new FormData() })).toThrow(needsBackend);
    expect(() => savedFile("/api/estimate/home", post({ zip: "10001", paid: 1, bought_year: 2020 }))).toThrow(needsBackend);
    expect(() => savedFile("/api/filings/0001-26-1/summary")).toThrow(needsBackend);
  });
});

describe("the saved example matches what build_saved.py recorded", () => {
  it("same holdings, key, close and tickers as saved/index.json", () => {
    expect(SAVED_EXAMPLE).toEqual(index.example);
    expect(savedKey(SAVED_EXAMPLE)).toBe(index.example_key);
    expect(SAVED_AS_OF).toBe(shortDate(index.as_of));
    expect(SAVED_TICKERS.split(/, | and /).sort()).toEqual([...index.tickers].sort());
  });
});

describe("every call the demo makes for the example has a saved answer", () => {
  let api: typeof import("../api").api;
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_STONE_SAVED", "1");
    vi.resetModules();
    vi.stubGlobal("fetch", async (url: string) => {
      const ok = existsSync(disk(url));
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(readFileSync(disk(url), "utf8")) };
    });
    ({ api } = await import("../api"));
    return () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    };
  });

  it("board, risk card, briefing, today, fund, market and lists", async () => {
    const symbols = SAVED_EXAMPLE.map((h) => h.symbol);
    await expect(api.portfolio(SAVED_EXAMPLE)).resolves.toMatchObject({ exposure: expect.any(Array) });
    await expect(api.risk(SAVED_EXAMPLE)).resolves.toMatchObject({ market_symbol: "SPY" });
    await expect(api.briefing(SAVED_EXAMPLE)).resolves.toMatchObject({ lines: expect.any(Array) });
    await expect(api.today()).resolves.toMatchObject({ day: index.as_of });
    await expect(api.today(symbols)).resolves.toMatchObject({ day: index.as_of });
    await expect(api.today([...symbols].reverse())).resolves.toMatchObject({ day: index.as_of });
    await expect(api.fund("SPY")).resolves.toMatchObject({ symbol: "SPY" });
    await expect(api.marketRateJump()).resolves.toMatchObject({ symbol: "SPY" });
    for (const f of [api.status, api.companies, api.scan, api.labSignals]) await expect(f()).resolves.toBeTruthy();
  });

  it("each saved ticker's page, its /today and every Lab test", async () => {
    const signals = await api.labSignals();
    await expect(api.company("MSFT")).resolves.toMatchObject({ company: { ticker: "MSFT" } }); // a look-through sparkline
    for (const t of index.tickers as string[]) {
      await expect(api.company(t)).resolves.toMatchObject({ company: { ticker: t } });
      await expect(api.companyToday(t)).resolves.toMatchObject({ ticker: t });
      if (t === "SPY") continue; // the market's own test is marketRateJump
      for (const s of signals) await expect(api.lab(t, s.key)).resolves.toMatchObject({ signal: s.key });
    }
  });

  it("says 404 for what isn't saved and 503 for what needs the backend", async () => {
    await expect(api.company("TSLA")).rejects.toMatchObject({ status: 404 });
    await expect(api.portfolio([{ symbol: "BX", shares: 1 }])).rejects.toMatchObject({ status: 404 });
    await expect(api.portfolio([], { other: [{ kind: "private_fund", fund: "BREIT", amount: 1 }] })).rejects.toMatchObject({ status: 404 });
    await expect(api.privateFund("BREIT")).rejects.toMatchObject({ status: 404 });
    await expect(api.lookupFund("FXAIX")).rejects.toMatchObject({ status: 404 });
    await expect(api.reconcile([], null)).rejects.toMatchObject({ status: 503 });
    await expect(api.estimateHome({ zip: "10001", paid: 1, bought_year: 2020 })).rejects.toMatchObject({ status: 503 });
    await expect(api.screenshot(new File([], "s.png"))).rejects.toMatchObject({ status: 503 });
    await expect(api.filingSummary("0001-26-1")).rejects.toMatchObject({ status: 503 });
  });
});
