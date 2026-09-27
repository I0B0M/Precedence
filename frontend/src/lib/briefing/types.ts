// The Briefing: an ordered list of spoken lines about the board, each tied to the evidence it came
// from. The same shape comes from POST /api/briefing/portfolio (the backend's expert panel) and from
// compose.ts (the same panel, run in the browser on the board it already has).

export type Tone = "calm" | "watch" | "note";

export interface Line {
  id: string;
  /** One sentence, plain words, as the captions show it. */
  text: string;
  /** The same sentence with tickers spoken as names, for the voice. Falls back to `text`. */
  say: string;
  /** Pro captions, with the working: case counts, normal rate, 90% range. Falls back to `text`. */
  pro?: string;
  tone: Tone;
  /** Evidence: "signal:<key>", "market:rate_jump", "risk:<field>", "price:<day>", "filing:<accession>", "fact:<key>". */
  cites: string[];
  /** The holding this line is about, if one. */
  ticker: string | null;
  /** A short chip label, e.g. "Amazon · Heads up". */
  title?: string;
  /** Where the working lives in the app, e.g. "/lab?t=AMZN&s=insider_cluster". */
  link?: string;
}

export interface ExpertReport {
  name: string;
  considered: number;
  spoken: number;
}

export interface HeldBack {
  expert?: string;
  text: string;
  reason: string;
}

/** Which experts spoke and what the gate held back: the "how Stone decided what to say" reveal. */
export interface Panel {
  experts: ExpertReport[];
  held_back: HeldBack[];
}

export interface Script {
  as_of: string | null;
  lines: Line[];
  panel: Panel;
  /** Where the lines came from: the backend's panel, or the same panel run here. */
  generated_by: string;
}
