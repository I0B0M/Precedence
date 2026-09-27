import { describe, expect, it } from "vitest";
import type { Status } from "../api";
import { screenshotChoice, shotError } from "../importing";

const st = (o: Partial<Status>): Status => ({ data: "real", companies_by_source: {}, ...o });

describe("screenshotChoice: the screenshot option in its real state", () => {
  it("uploads when the server can read, else offers only the sample when its reading is saved", () => {
    expect(screenshotChoice(st({ screenshots: true, screenshot_sample: false }), false)?.can).toBe("upload");
    expect(screenshotChoice(st({ screenshots: false, screenshot_sample: true }), false)).toEqual({
      can: "sample", note: "Try the sample screen. Your own needs a Gemini key on the server." });
    expect(screenshotChoice(st({ screenshots: false, screenshot_sample: false }), false)).toEqual({
      can: "none", note: "Needs a Gemini key on the server" });
  });

  it("on the saved site, says the full app is needed, not a key", () => {
    expect(screenshotChoice(st({ screenshot_sample: true }), true)?.note).toBe(
      "Try the sample screen. Your own needs the full app.");
    expect(screenshotChoice(st({}), true)).toEqual({ can: "none", note: "Needs the full app" });
  });

  it("waits for the status, and never says AI", () => {
    expect(screenshotChoice(null, false)).toBeNull();
    for (const s of [st({ screenshots: true }), st({ screenshot_sample: true }), st({})]) {
      expect(screenshotChoice(s, false)!.note).not.toMatch(/\b(AI|machine learning)\b/i);
    }
  });
});

describe("shotError: why a screenshot wasn't read", () => {
  const upload = { can: "upload" as const, note: "" };
  const sample = { can: "sample" as const, note: "" };
  it("shows the file's own problem, and names the missing key only when there is none", () => {
    expect(shotError(415, "Add the screenshot as a PNG.", upload, false)).toBe("Add the screenshot as a PNG. Type the rows below instead.");
    expect(shotError(503, "GEMINI_API_KEY is not set", sample, false)).toBe(
      "Reading screenshots needs a Gemini key on the server. Type the rows below instead.");
    expect(shotError(503, "Gemini is busy", upload, false)).toBe("Screenshot reading is off right now. Type the rows below instead.");
    expect(shotError(503, "x", sample, true)).toBe("Reading your own screenshot needs the full app. Type the rows below instead.");
    expect(shotError(404, "Not in the saved data.", sample, true)).toBe("The sample isn't in the saved data. Type the rows below instead.");
    expect(shotError(0, "", upload, false)).toBe("Can't reach our server. Type the rows below instead.");
  });
});
