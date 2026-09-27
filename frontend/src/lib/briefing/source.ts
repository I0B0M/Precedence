// Where the script comes from. First the backend's panel (api.briefing: POST /api/briefing/portfolio, or its
// saved copy on the saved-data demo). If that isn't there, the same panel runs here on the board
// the page already fetched. Either way the page always has lines to say.

import { api, type Holding, type PortfolioIn, type PortfolioOut, type PortfolioRisk } from "@/lib/api";
import { composeScript, namesOf } from "./compose";
import { toSpeech } from "./spoken";
import type { Line, Script, Tone } from "./types";

const TONES: Tone[] = ["calm", "watch", "note"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Accepts the backend's shape (text plus optional say/pro/title/link/ticker) and fills what's missing.
    Anything malformed is dropped rather than spoken. Returns null when nothing usable is left. */
export function normalizeScript(raw: unknown, names: Record<string, string>): Script | null {
  if (!isRecord(raw) || !Array.isArray(raw.lines)) return null;
  const lines: Line[] = [];
  raw.lines.forEach((l, i) => {
    if (!isRecord(l) || typeof l.text !== "string" || !l.text.trim()) return;
    const tone = TONES.includes(l.tone as Tone) ? (l.tone as Tone) : "note";
    const cites = Array.isArray(l.cites) ? l.cites.filter((c): c is string => typeof c === "string") : [];
    const ticker = typeof l.ticker === "string" && l.ticker ? l.ticker.toUpperCase() : null;
    lines.push({
      id: typeof l.id === "string" && l.id ? l.id : `l${i + 1}`,
      text: l.text.trim(),
      say: typeof l.say === "string" && l.say.trim() ? l.say.trim() : toSpeech(l.text.trim(), names),
      pro: typeof l.pro === "string" && l.pro.trim() ? l.pro.trim() : undefined,
      tone, cites, ticker,
      title: typeof l.title === "string" ? l.title : undefined,
      // A bare "/" is never a real destination for one line's evidence (it is the whole landing page), so
      // treat it the same as no link at all rather than sending a judge to a dead end.
      link: typeof l.link === "string" && l.link.startsWith("/") && l.link !== "/" ? l.link : ticker ? `/company/${ticker}` : undefined,
    });
  });
  if (!lines.length) return null;
  const panel = isRecord(raw.panel) ? raw.panel : {};
  const experts = Array.isArray(panel.experts) ? panel.experts.filter(isRecord).map((e) => ({
    name: String(e.name ?? "?"), considered: Number(e.considered ?? 0) || 0, spoken: Number(e.spoken ?? 0) || 0,
  })) : [];
  const held = Array.isArray(panel.held_back) ? panel.held_back.filter(isRecord).map((h) => ({
    expert: typeof h.expert === "string" ? h.expert : undefined, text: String(h.text ?? ""), reason: String(h.reason ?? ""),
  })) : [];
  return {
    as_of: typeof raw.as_of === "string" ? raw.as_of : null,
    lines,
    panel: { experts, held_back: held },
    generated_by: typeof raw.generated_by === "string" ? raw.generated_by : "experts (api)",
  };
}

/** The script for these holdings: the backend's when it has one, else composed here. Never throws
    for a missing backend script; only the board itself is required. */
export async function loadScript(holdings: Holding[], portfolio: PortfolioOut, risk: PortfolioRisk | null,
                                 extras: Omit<PortfolioIn, "holdings"> = {}): Promise<Script> {
  const names = namesOf(portfolio);
  try {
    const remote = normalizeScript(await api.briefing(holdings, extras), names);
    if (remote) return remote;
  } catch {
    // 404 in saved mode, backend without the endpoint, or a network slip: the browser panel takes over.
  }
  return composeScript({ portfolio, risk });
}
