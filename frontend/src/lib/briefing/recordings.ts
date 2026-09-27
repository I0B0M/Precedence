// The narrator's recorded voice: the saved briefing lines read ahead of time by Kokoro-82M, an
// open-weight speech model (backend/scripts/build_voice.py). A recording is found by the line's exact
// `say`, so a line that has changed since it was recorded is read by the browser's voice instead.

export interface Recording {
  /** The MP3, e.g. "/saved/voice/0123abcd.mp3". */
  src: string;
  /** Seconds. */
  dur: number;
  /** When each spoken word starts, in seconds, in order. */
  words: number[];
  /** Loudness every 50 ms, 0..1. */
  level: number[];
}

export type Recordings = Map<string, Recording>;

const INDEX = "/saved/voice/index.json";
const STEP = 0.05; // seconds per loudness value

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numbers = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : null;

/** The index file as a map from `say` to its recording. Malformed entries are dropped, not played. */
export function parseRecordings(raw: unknown): Recordings {
  const out: Recordings = new Map();
  if (!isRecord(raw) || !isRecord(raw.lines)) return out;
  for (const [say, r] of Object.entries(raw.lines)) {
    if (!isRecord(r) || typeof r.src !== "string" || !r.src.startsWith("/")) continue;
    const dur = Number(r.dur);
    const words = numbers(r.words);
    const level = numbers(r.level) ?? [];
    if (!(dur > 0) || !words) continue;
    out.set(say, { src: r.src, dur, words, level });
  }
  return out;
}

/** The recordings the site ships with; none (the browser's voice reads everything) if there are none. */
export async function loadRecordings(): Promise<Recordings> {
  try {
    const res = await fetch(INDEX);
    return res.ok ? parseRecordings(await res.json()) : new Map();
  } catch {
    return new Map();
  }
}

/** How far through the line the voice is at `t` seconds, 0..1, counted in words started. */
export function fractionAt(rec: Recording, t: number): number {
  if (!rec.words.length) return Math.max(0, Math.min(1, t / rec.dur));
  let n = 0;
  while (n < rec.words.length && rec.words[n] <= t) n += 1;
  return n / rec.words.length;
}

/** How loud the voice is at `t` seconds, 0..1. */
export function levelAt(rec: Recording, t: number): number {
  if (!rec.level.length) return 0;
  const i = Math.max(0, Math.min(rec.level.length - 1, Math.floor(t / STEP)));
  return rec.level[i];
}
