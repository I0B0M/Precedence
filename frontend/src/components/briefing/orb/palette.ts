// What the orb does in each state, and Stone's colours for it. The behaviour table is Eno's
// (ui/lib/types.ts, MIT); the palette is Stone's: Pro purple at rest, orange for Heads up.

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
  idle: { yaw: 6, pulseHz: 0.25, depth: 0.08, flow: 0.06, sparkle: 0.2, ring: 1.0 },
  thinking: { yaw: 18, pulseHz: 1.6, depth: 0.12, flow: 0.85, sparkle: 0.8, ring: 1.15 },
  speaking: { yaw: 6, pulseHz: 0.5, depth: 0.06, flow: 1.0, sparkle: 0.65, ring: 1.1 },
  paused: { yaw: 2, pulseHz: 0.15, depth: 0.05, flow: 0.03, sparkle: 0.08, ring: 0.6 },
  needs: { yaw: 0, pulseHz: 0.5, depth: 0.15, flow: 0.1, sparkle: 0.1, ring: 1.45 },
  failed: { yaw: 2, pulseHz: 0.8, depth: 0.1, flow: 0.15, sparkle: 0.05, ring: 0.85 },
};

export interface OrbColor {
  core: number; // 0xRRGGBB
  glow: number;
}

export const ORB_PALETTE: Record<OrbStateName, OrbColor> = {
  idle: { core: 0x0b0a16, glow: 0x8e6cf0 },
  thinking: { core: 0x0d1526, glow: 0xa9c8ff },
  speaking: { core: 0x14102b, glow: 0xe9e2ff },
  paused: { core: 0x0a0912, glow: 0x4b4560 },
  needs: { core: 0x1c1204, glow: 0xffb13a },
  failed: { core: 0x1c0705, glow: 0xd23b2e },
};

/** While speaking, the glow follows the line's tone: orange for Heads up, purple for calm. */
export const TINT_GLOW: Record<OrbTint, number> = {
  calm: 0xc9b8ff,
  watch: 0xf26b21,
  note: 0x9fd1ff,
};

export const VISUALS = {
  noise_scale: 1.8, facet_drift: 0.02, pulse_swell: 0.034, speech_swell: 0.09,
  fresnel: 2.4, glow: 1.0, body_alpha: 0.86, exposure: 1.1,
  edge_width: 0.0045, edge_glow: 0.9, core_size: 0.3, core_glow: 1.0,
  ring_scale: 1.34, ring_power: 3.0, ring_strength: 0.54,
  corona_count: 2400, corona_drift: 0.35, corona_size: 3.6,
  cluster_radius: 0.52, cluster_focus: 2.2, field_share: 0.22,
  hue_spread: 1.0, hue_phase: 0.22, state_tint: 0.0, core_heat: 0.7,
} as const;

export const cssColor = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;
