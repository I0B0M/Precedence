"use client";

import { useCallback, useEffect, useState } from "react";
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

export function readHoldings(): Holding[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Holding[]) : null;
  } catch {
    return null;
  }
}

export function saveHoldings(h: Holding[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {}
}

export function useHoldings(fallback: Holding[] | null) {
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  useEffect(() => {
    setHoldings(readHoldings() ?? fallback);
  }, [fallback]);
  const set = useCallback((h: Holding[]) => {
    saveHoldings(h);
    setHoldings(h);
  }, []);
  return [holdings, set] as const;
}
