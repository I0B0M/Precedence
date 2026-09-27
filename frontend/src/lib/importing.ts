// The /import page's ways in, each in its real state. Plain words: the page reads a screenshot; it never
// claims more than the server can do right now.
import type { Status } from "./api";

export interface ShotChoice {
  /** upload: any screenshot; sample: only the sample screen (its reading is saved); none: neither works here. */
  can: "upload" | "sample" | "none";
  note: string;
}

/** What the screenshot option can do, from /api/status. null until the status is known. */
export function screenshotChoice(status: Status | null, saved: boolean): ShotChoice | null {
  if (!status) return null;
  if (status.screenshots) return { can: "upload", note: "Any app, any account" };
  const own = saved ? "Your own needs the full app." : "Your own needs a Gemini key on the server.";
  if (status.screenshot_sample) return { can: "sample", note: `Try the sample screen. ${own}` };
  return { can: "none", note: saved ? "Needs the full app" : "Needs a Gemini key on the server" };
}

/** Why a screenshot wasn't read, in the page's words. The API's detail is shown only for problems with the file
 *  (413/415/422); a 502/503 names env vars and models, so it gets these words, as does not reaching us at all. */
export function shotError(status: number, detail: string, choice: ShotChoice | null, saved: boolean): string {
  const instead = "Type the rows below instead.";
  if ([413, 415, 422].includes(status)) return `${detail} ${instead}`;
  if (status === 503 && choice?.can !== "upload") {
    return saved ? `Reading your own screenshot needs the full app. ${instead}`
      : `Reading screenshots needs a Gemini key on the server. ${instead}`;
  }
  if (status === 502 || status === 503) return `Screenshot reading is off right now. ${instead}`;
  if (status === 404 && saved) return `The sample isn't in the saved data. ${instead}`;
  return `Can't reach our server. ${instead}`;
}
