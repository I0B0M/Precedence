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

// A stand-in for HTMLAudioElement: plays when asked (or refuses), and the test moves its clock.
class FakeAudio {
  static made: FakeAudio[] = [];
  static refuse = false;
  src = "";
  preload = "";
  currentTime = 0;
  paused = true;
  played: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeAudio.made.push(this); }
  play() {
    if (FakeAudio.refuse) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    this.played.push(`${this.src}@${this.currentTime}`);
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; }
  load() {}
  end() { this.paused = true; this.onended?.(); }
}

describe("createNarrator with recordings", () => {
  const rec = (src: string) => ({ src, dur: 2, words: [0.1, 0.8, 1.4], level: [0, 0.4, 0.8, 1] });
  const lines = [{ say: "one two three", recording: rec("/saved/voice/a.mp3") }, { say: "four five six", recording: rec("/saved/voice/b.mp3") }];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudio.made = [];
    FakeAudio.refuse = false;
    vi.stubGlobal("window", { Audio: FakeAudio });
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("plays each line's recording on one element, follows its words and loudness, and breathes between lines", () => {
    const started: number[] = [];
    const progress: [number, number, number | undefined][] = [];
    const n = createNarrator(lines, { onLine: (i) => started.push(i), onProgress: (i, f, lv) => progress.push([i, f, lv]), onStatus: () => {} });
    n.play();
    const [el, warm] = FakeAudio.made;
    expect(el.played).toEqual(["/saved/voice/a.mp3@0"]);
    expect(warm.src).toBe("/saved/voice/b.mp3"); // the next line loads while this one plays
    el.currentTime = 0.12;
    vi.advanceTimersByTime(60);
    expect(progress.at(-1)).toEqual([0, 1 / 3, 0.8]);
    el.end();
    expect(started).toEqual([0]);
    vi.advanceTimersByTime(300);
    expect(started).toEqual([0, 1]);
    expect(el.played.at(-1)).toBe("/saved/voice/b.mp3@0");
    n.destroy();
  });

  it("picks a paused recording up where it stopped", () => {
    const n = createNarrator(lines, { onLine: () => {}, onProgress: () => {}, onStatus: () => {} });
    n.play();
    const el = FakeAudio.made[0];
    el.currentTime = 1.1;
    n.pause();
    expect(el.paused).toBe(true);
    n.toggle();
    expect(el.played.at(-1)).toBe("/saved/voice/a.mp3@1.1");
    n.destroy();
  });

  it("reads the line another way when the recording won't play", async () => {
    FakeAudio.refuse = true;
    const started: number[] = [];
    const n = createNarrator(lines, { onLine: (i) => started.push(i), onProgress: () => {}, onStatus: () => {} });
    n.play();
    await vi.advanceTimersByTimeAsync(20000);
    expect(started).toEqual([0, 1]);
    expect(n.status).toBe("done");
    n.destroy();
  });

  it("ignores the recordings with the voice off", () => {
    const n = createNarrator(lines, { onLine: () => {}, onProgress: () => {}, onStatus: () => {} }, { voice: false });
    n.play();
    expect(FakeAudio.made).toEqual([]);
    n.destroy();
  });
});

describe("pickVoice", () => {
  const v = (name: string, lang: string, localService = false) => ({ name, lang, localService }) as SpeechSynthesisVoice;
  it("prefers a neural voice: Edge's Natural, then Apple's Premium or Enhanced, American English first", () => {
    expect(pickVoice([v("Samantha", "en-US"), v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB"),
      v("Microsoft Ava Online (Natural) - English (United States)", "en-US")])?.name).toMatch(/^Microsoft Ava/);
    expect(pickVoice([v("Samantha", "en-US"), v("Zoe (Premium)", "en-US"), v("Evan (Enhanced)", "en-US")])?.name).toBe("Zoe (Premium)");
    expect(pickVoice([v("Samantha", "en-US"), v("Evan (Enhanced)", "en-US")])?.name).toBe("Evan (Enhanced)");
    expect(pickVoice([v("Samantha", "en-US"), v("Amélie (Premium)", "fr-CA")])?.name).toBe("Samantha");
  });

  it("prefers a known good English voice, then a local English one, then any English one", () => {
    expect(pickVoice([v("Google français", "fr-FR"), v("Daniel", "en-GB"), v("Samantha", "en-US")])?.name).toBe("Samantha");
    expect(pickVoice([v("Zed", "en-AU"), v("Local", "en-IN", true)])?.name).toBe("Local");
    expect(pickVoice([v("Zed", "en-AU")])?.name).toBe("Zed");
    expect(pickVoice([v("Only", "fr-FR")])?.name).toBe("Only");
    expect(pickVoice([])).toBeNull();
  });
});
