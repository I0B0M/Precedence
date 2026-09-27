// Graphics tiers and the frame-time guard. Ported from Eno (ui/orb/tiers.ts, MIT).
// No tier caps the frame rate itself; the guard reacts to measured cost, demoting fast (3 s)
// and promoting slowly (30 s) so the tier never oscillates around a threshold.

export type GraphicsTier = "low" | "medium" | "high" | "ultra";

export interface TierSpec {
  /** Icosahedron subdivision level; drives facet, edge and node counts. */
  detail: number;
  /** Multiplies the corona's point count. */
  coronaMultiplier: number;
  edgeSides: number;
  coreSegments: number;
  ring: boolean;
  dprCap: number;
}

export const TIERS: Record<GraphicsTier, TierSpec> = {
  low: { detail: 1, coronaMultiplier: 0.15, edgeSides: 6, coreSegments: 12, ring: false, dprCap: 1.0 },
  medium: { detail: 1, coronaMultiplier: 0.4, edgeSides: 8, coreSegments: 16, ring: true, dprCap: 1.5 },
  high: { detail: 3, coronaMultiplier: 0.75, edgeSides: 8, coreSegments: 24, ring: true, dprCap: 2.0 },
  ultra: { detail: 3, coronaMultiplier: 1.0, edgeSides: 10, coreSegments: 32, ring: true, dprCap: 2.0 },
};

export const TIER_ORDER: GraphicsTier[] = ["low", "medium", "high", "ultra"];

/** Guess a starting tier from the GPU name. Unknown hardware starts at medium, never low: the
    guard demotes within seconds if that was optimistic, while starting too low makes capable
    hardware look bad on first impression. */
export function probeTier(gl: WebGL2RenderingContext): GraphicsTier {
  let renderer = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "");
  } catch {
    // Some browsers block this; fall through to the default.
  }
  const r = renderer.toLowerCase();
  if (!r) return "medium";
  if (/apple m\d|rtx\s*(30|40|50)\d\d|rx\s*(6[789]|7\d)\d\d|arc\s*a7/.test(r)) return "ultra";
  if (/apple gpu|gtx\s*16|rtx\s*20\d\d|rx\s*5[6789]\d\d|arc\s*a3/.test(r)) return "high";
  return "medium";
}

export class FpsGuard {
  private samples: number[] = [];
  private lastChange = performance.now();

  constructor(
    private current: GraphicsTier,
    private readonly ceiling: GraphicsTier,
    private readonly onChange: (tier: GraphicsTier) => void,
  ) {}

  sample(frameMs: number): void {
    this.samples.push(frameMs);
    if (this.samples.length > 1800) this.samples.shift();
    const now = performance.now();
    const sinceChange = now - this.lastChange;
    // Roughly 3 s and 30 s of frames at 60 fps.
    if (sinceChange > 3000 && this.median(180) > 20) this.step(-1, now);
    else if (sinceChange > 30000 && this.median(1800) < 10) this.step(1, now);
  }

  private median(count: number): number {
    const window = this.samples.slice(-count);
    if (window.length < count / 2) return 16.7; // not enough data yet: assume nominal
    const sorted = [...window].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private step(direction: -1 | 1, now: number): void {
    const idx = TIER_ORDER.indexOf(this.current);
    const ceilingIdx = TIER_ORDER.indexOf(this.ceiling);
    const next = idx + direction;
    if (next < 0 || next >= TIER_ORDER.length || next > ceilingIdx) return;
    this.current = TIER_ORDER[next];
    this.lastChange = now;
    this.samples = [];
    this.onChange(this.current);
  }
}
