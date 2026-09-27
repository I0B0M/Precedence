// What the orb does in each state, and Precedence's colours for it. The behaviour table is Eno's
// (ui/lib/types.ts, MIT); the palette is Precedence's: royal blue at rest and for Calm, gold for Heads up.

export type OrbStateName = "idle" | "thinking" | "speaking" | "paused" | "needs" | "failed";

/** The colour the orb takes while it speaks: what it is saying, not how. */
export type OrbTint = "calm" | "watch" | "note";

export interface OrbState {
  state: OrbStateName;
  tint?: OrbTint;
  /** The voice's loudness right now, 0..1. Only fresh for 200 ms; the speech rhythm takes over after. */
  level?: number;
}

export interface OrbBehavior {
  yaw: number; // degrees per second
  pulseHz: number;
  depth: number;
  flow: number;
  sparkle: number;
  ring: number;
}

export const ORB_BEHAVIOR: Record<OrbStateName, OrbBehavior> = {
  idle: { yaw: 8, pulseHz: 0.25, depth: 0.14, flow: 0.1, sparkle: 0.32, ring: 1.0 },
  thinking: { yaw: 20, pulseHz: 1.6, depth: 0.18, flow: 0.9, sparkle: 0.9, ring: 1.15 },
  speaking: { yaw: 8, pulseHz: 0.5, depth: 0.12, flow: 1.0, sparkle: 0.78, ring: 1.1 },
  paused: { yaw: 3, pulseHz: 0.15, depth: 0.08, flow: 0.05, sparkle: 0.14, ring: 0.6 },
  needs: { yaw: 0, pulseHz: 0.5, depth: 0.2, flow: 0.12, sparkle: 0.16, ring: 1.45 },
  failed: { yaw: 3, pulseHz: 0.8, depth: 0.14, flow: 0.18, sparkle: 0.08, ring: 0.85 },
};

export interface OrbColor {
  core: number; // 0xRRGGBB
  glow: number;
}

export const ORB_PALETTE: Record<OrbStateName, OrbColor> = {
  idle: { core: 0x05070d, glow: 0x2563eb },
  thinking: { core: 0x070b16, glow: 0x7aa2ff },
  speaking: { core: 0x0b0d14, glow: 0xe8ecf5 },
  paused: { core: 0x060708, glow: 0x4b4f5c },
  needs: { core: 0x140f02, glow: 0xd4af37 },
  failed: { core: 0x160605, glow: 0xff6961 },
};

/** While speaking, the glow follows the line's tone: gold for Heads up, royal blue for Calm. */
export const TINT_GLOW: Record<OrbTint, number> = {
  calm: 0x2563eb,
  watch: 0xd4af37,
  note: 0x7aa2ff,
};

export const VISUALS = {
  noise_scale: 1.8, facet_drift: 0.028, pulse_swell: 0.034, speech_swell: 0.11,
  fresnel: 3.0, glow: 1.25, body_alpha: 0.86, exposure: 1.2,
  edge_width: 0.0055, edge_glow: 1.15, core_size: 0.3, core_glow: 1.2,
  ring_scale: 1.34, ring_power: 3.0, ring_strength: 0.68,
  corona_count: 3400, corona_drift: 0.42, corona_size: 3.9,
  cluster_radius: 0.6, cluster_focus: 2.2, field_share: 0.28,
  hue_spread: 1.0, hue_phase: 0.22, state_tint: 0.0, core_heat: 0.7,
} as const;

export const cssColor = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;
