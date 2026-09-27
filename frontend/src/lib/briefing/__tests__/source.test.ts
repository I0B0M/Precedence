import { describe, expect, it } from "vitest";
import { normalizeScript } from "../source";

const names = { AMZN: "Amazon", SPY: "SPDR S&P 500 ETF" };

describe("normalizeScript (the backend's shape)", () => {
  it("accepts the agreed contract and fills say, link and ids", () => {
    const s = normalizeScript({
      ticker: null, as_of: "2026-09-25", generated_by: "experts",
      lines: [
        { id: "l1", text: "AMZN is Heads up: executives sold shares.", tone: "watch", cites: ["signal:insider_cluster"], ticker: "amzn" },
        { text: "SPY fell 10 of 15 times.", tone: "watch", cites: ["market:rate_jump"], ticker: "SPY", say: "the S&P 500 fund fell 10 of 15 times.", link: "/company/SPY", title: "S&P 500 · Heads up" },
      ],
      panel: { experts: [{ name: "Heads up", considered: 2, spoken: 2 }], held_back: [{ text: "x", reason: "limit" }] },
    }, names);
    expect(s?.lines[0]).toMatchObject({ id: "l1", ticker: "AMZN", link: "/company/AMZN", say: "Amazon is Heads up: executives sold shares." });
    expect(s?.lines[1]).toMatchObject({ id: "l2", say: "the S&P 500 fund fell 10 of 15 times.", link: "/company/SPY", title: "S&P 500 · Heads up" });
    expect(s?.panel.experts[0]).toEqual({ name: "Heads up", considered: 2, spoken: 2 });
    expect(s?.generated_by).toBe("experts");
  });

  it("drops malformed lines, off-site links and unknown tones rather than speaking them", () => {
    const s = normalizeScript({ lines: [
      { text: "", tone: "watch" },
      { text: "fine", tone: "loud", link: "https://evil.example", cites: [1, "signal:x"] },
      "junk", null,
    ] }, names);
    expect(s?.lines).toHaveLength(1);
    expect(s?.lines[0]).toMatchObject({ tone: "note", link: undefined, cites: ["signal:x"] });
  });

  it("returns null when there is nothing to say", () => {
    expect(normalizeScript({ lines: [] }, names)).toBeNull();
    expect(normalizeScript(null, names)).toBeNull();
    expect(normalizeScript("nope", names)).toBeNull();
  });
});
