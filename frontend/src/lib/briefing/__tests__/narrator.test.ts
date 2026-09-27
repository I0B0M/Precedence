import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNarrator, pickVoice } from "../narrator";

// No speechSynthesis in node, so the narrator runs on its timed fallback: the path a browser without
// a voice (or one that refuses to speak) takes.
describe("createNarrator without a voice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const lines = [{ say: "one two three" }, { say: "four five six" }];

  it("plays every line in order and finishes", () => {
    const started: number[] = [];
    const status: string[] = [];
    const n = createNarrator(lines, { onLine: (i) => started.push(i), onProgress: () => {}, onStatus: (s) => status.push(s) });
    n.play();
    expect(started).toEqual([0]);
    vi.advanceTimersByTime(20000);
    expect(started).toEqual([0, 1]);
    expect(status).toEqual(["playing", "done"]);
    expect(n.status).toBe("done");
    n.destroy();
  });

  it("pauses without advancing, then resumes the same line; next and restart jump", () => {
    const started: number[] = [];
    const n = createNarrator(lines, { onLine: (i) => started.push(i), onProgress: () => {}, onStatus: () => {} });
    n.play();
    n.pause();
    vi.advanceTimersByTime(20000);
    expect(started).toEqual([0]);
    expect(n.status).toBe("paused");
    n.toggle();
    expect(started).toEqual([0, 0]);
    n.next();
    expect(n.index).toBe(1);
    n.restart();
    expect(n.index).toBe(0);
    n.destroy();
  });

  it("reports progress from 0 to 1 within a line", () => {
    const seen: number[] = [];
    const n = createNarrator([{ say: "one two three four five" }], { onLine: () => {}, onProgress: (_, f) => seen.push(f), onStatus: () => {} });
    n.play();
    vi.advanceTimersByTime(20000);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen.every((f, i) => i === 0 || f >= seen[i - 1])).toBe(true);
    n.destroy();
  });

  it("is done at once with no lines", () => {
    const status: string[] = [];
    const n = createNarrator([], { onLine: () => {}, onProgress: () => {}, onStatus: (s) => status.push(s) });
    n.play();
    expect(status).toEqual(["done"]);
  });
});

describe("pickVoice", () => {
  const v = (name: string, lang: string, localService = false) => ({ name, lang, localService }) as SpeechSynthesisVoice;
  it("prefers a known good English voice, then a local English one, then any English one", () => {
    expect(pickVoice([v("Google français", "fr-FR"), v("Daniel", "en-GB"), v("Samantha", "en-US")])?.name).toBe("Samantha");
    expect(pickVoice([v("Zed", "en-AU"), v("Local", "en-IN", true)])?.name).toBe("Local");
    expect(pickVoice([v("Zed", "en-AU")])?.name).toBe("Zed");
    expect(pickVoice([v("Only", "fr-FR")])?.name).toBe("Only");
    expect(pickVoice([])).toBeNull();
  });
});
