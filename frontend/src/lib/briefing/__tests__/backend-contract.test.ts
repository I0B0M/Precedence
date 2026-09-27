import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeScript } from "../source";

// The backend's saved briefings (backend/stone/briefing, written by build_saved.py) through the tab's own parser:
// nothing the backend checked may be dropped or rewritten on the way to the voice and the captions.
const KEY = "AAPL-10_AMZN-10_BX-10_JPM-10_NVDA-10_SPY-5";
const saved = (path: string) => JSON.parse(readFileSync(`public/saved/briefing/${path}.json`, "utf8"));

describe("the backend's saved briefing, as the tab reads it", () => {
  const raw = saved(`portfolio/${KEY}`);
  const script = normalizeScript(raw, {});

  it("keeps every line with its words, voice, Pro caption and cites", () => {
    expect(script?.lines.length).toBe(raw.lines.length);
    script?.lines.forEach((l, i) => {
      expect(l.text).toBe(raw.lines[i].text);
      expect(l.say).toBe(raw.lines[i].say);
      expect(l.pro).toBe(raw.lines[i].pro ?? undefined);
      expect(l.cites).toEqual(raw.lines[i].cites);
      expect(l.tone).toBe(raw.lines[i].tone);
    });
    expect(script?.lines.filter((l) => l.pro).length).toBeGreaterThan(5);
  });

  it("keeps the panel's reveal: who spoke and what the gate held back", () => {
    expect(script?.panel.experts.map((e) => e.name)).toEqual(raw.panel.experts.map((e: { name: string }) => e.name));
    expect(script?.panel.held_back).toEqual(raw.panel.held_back);
    expect(script?.generated_by).toMatch(/no language model/);
  });

  it("reads every saved ticker's briefing", () => {
    for (const t of ["AAPL", "AMZN", "BX", "JPM", "NVDA", "SPY"]) {
      expect(normalizeScript(saved(t), {})?.lines.length, t).toBeGreaterThan(2);
    }
  });
});
