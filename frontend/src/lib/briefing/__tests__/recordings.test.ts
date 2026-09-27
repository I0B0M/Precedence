import { describe, expect, it } from "vitest";
import { fractionAt, levelAt, parseRecordings, type Recording } from "../recordings";

const rec: Recording = { src: "/saved/voice/a.mp3", dur: 2, words: [0.3, 0.6, 1.2, 1.5], level: [0, 0.5, 1, 0.25] };

describe("parseRecordings", () => {
  it("keys each recording by its line's exact words and drops anything it can't play", () => {
    const map = parseRecordings({
      engine: "Kokoro-82M v1.0",
      lines: {
        "Rates jumped.": { src: "/saved/voice/a.mp3", dur: 1.5, words: [0.2, 0.6], level: [0.1, 0.9] },
        "No level is fine.": { src: "/saved/voice/b.mp3", dur: 1, words: [0.1] },
        "Remote file.": { src: "https://example.com/x.mp3", dur: 1, words: [0.1] },
        "No length.": { src: "/saved/voice/c.mp3", dur: 0, words: [0.1] },
        "Bad words.": { src: "/saved/voice/d.mp3", dur: 1, words: ["0.1"] },
        "Not an object.": 7,
      },
    });
    expect([...map.keys()]).toEqual(["Rates jumped.", "No level is fine."]);
    expect(map.get("No level is fine.")?.level).toEqual([]);
  });

  it("is empty for anything that isn't an index", () => {
    expect(parseRecordings(null).size).toBe(0);
    expect(parseRecordings({ lines: [] }).size).toBe(0);
    expect(parseRecordings("nope").size).toBe(0);
  });
});

describe("fractionAt", () => {
  it("counts the words the voice has started", () => {
    expect(fractionAt(rec, 0)).toBe(0);
    expect(fractionAt(rec, 0.3)).toBe(0.25);
    expect(fractionAt(rec, 1.3)).toBe(0.75);
    expect(fractionAt(rec, 5)).toBe(1);
  });

  it("falls back to time over length when there are no word times", () => {
    expect(fractionAt({ ...rec, words: [] }, 1)).toBe(0.5);
    expect(fractionAt({ ...rec, words: [] }, 9)).toBe(1);
  });
});

describe("levelAt", () => {
  it("reads the loudness every 50 ms and holds the ends", () => {
    expect(levelAt(rec, 0)).toBe(0);
    expect(levelAt(rec, 0.06)).toBe(0.5);
    expect(levelAt(rec, 0.12)).toBe(1);
    expect(levelAt(rec, 60)).toBe(0.25);
    expect(levelAt({ ...rec, level: [] }, 0.12)).toBe(0);
  });
});
