"use client";

import { useSyncExternalStore } from "react";
import type { Holding } from "./api";

// Holdings live in this browser until sign-in exists. Sample mode starts with the
// fictional sample portfolio so the board is never empty in development.
const KEY = "stone.holdings";
export const NO_HOLDINGS: Holding[] = [];
export const SAMPLE_PORTFOLIO: Holding[] = [
  { symbol: "HLCN", shares: 62 },
  { symbol: "MRDN", shares: 140 },
  { symbol: "ORCA", shares: 30 },
  { symbol: "BRVE", shares: 55 },
  { symbol: "BRD500", shares: 12 },
];

let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cached: Holding[] | null = null;
const listeners = new Set<() => void>();

function raw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

/** Same array back until the stored text changes, as useSyncExternalStore requires. */
export function readHoldings(): Holding[] | null {
  const r = raw();
  if (r !== cachedRaw) {
    cachedRaw = r;
    try {
      cached = r ? (JSON.parse(r) as Holding[]) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function saveHoldings(h: Holding[]) {
  memory = JSON.stringify(h);
  try {
    localStorage.setItem(KEY, memory);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Saved holdings, else `fallback` (null while the caller doesn't know yet). */
export function useHoldings(fallback: Holding[] | null) {
  const stored = useSyncExternalStore(subscribe, readHoldings, () => null);
  return [stored ?? fallback, saveHoldings] as const;
}
