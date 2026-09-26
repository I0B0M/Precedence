"use client";

import { useSyncExternalStore } from "react";
import type { Holding } from "./api";

// Practice money lives in this browser only. No order is ever sent anywhere.
const KEY = "stone.practice";
export const PRACTICE_CASH = 5000;

export interface PracticeTrade {
  at: string; // when the practice trade was placed (ISO)
  symbol: string;
  side: "buy" | "sell";
  shares: number; // whole shares only
  price: number; // the close it was priced at
  day: string; // that close's date
}

export interface PracticeState {
  cash: number;
  positions: Record<string, number>; // symbol -> shares
  trades: PracticeTrade[];
  started: string;
  seeded?: Record<string, number>; // symbol -> shares copied from the portfolio at the start (absent in older saves)
}

let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cached: PracticeState | null = null;
const listeners = new Set<() => void>();

function raw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

/** Same object back until the stored text changes, as useSyncExternalStore requires. */
function read(): PracticeState | null {
  const r = raw();
  if (r !== cachedRaw) {
    cachedRaw = r;
    try {
      cached = r ? (JSON.parse(r) as PracticeState) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

function write(s: PracticeState) {
  memory = JSON.stringify(s);
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

/** A fresh practice account: what the board holds, plus practice cash. */
export function freshPractice(holdings: Holding[]): PracticeState {
  const positions: Record<string, number> = {};
  for (const h of holdings) if (h.shares > 0) positions[h.symbol] = (positions[h.symbol] ?? 0) + h.shares;
  return { cash: PRACTICE_CASH, positions, trades: [], started: new Date().toISOString(), seeded: { ...positions } };
}

export function resetPractice(holdings: Holding[]) {
  write(freshPractice(holdings));
}

/** Why a trade can't go through, or null if it can. No leverage, no shorting, whole shares only. */
export function tradeProblem(s: PracticeState, side: "buy" | "sell", symbol: string, shares: number, price: number | null): string | null {
  if (!symbol) return "Pick a stock.";
  if (price == null) return "No closing price for this one yet.";
  if (!Number.isInteger(shares) || shares < 1) return "Whole shares only, at least 1.";
  if (side === "buy" && shares * price > s.cash + 1e-9) return "Not enough practice cash. Practice has no borrowing.";
  if (side === "sell" && shares > Math.floor(s.positions[symbol] ?? 0)) {
    const held = Math.floor(s.positions[symbol] ?? 0);
    return held ? `You hold ${held} whole share${held > 1 ? "s" : ""} of ${symbol}. Practice has no short selling.` : `You don't hold ${symbol}. Practice has no short selling.`;
  }
  return null;
}

export function placeTrade(s: PracticeState, t: Omit<PracticeTrade, "at">) {
  if (tradeProblem(s, t.side, t.symbol, t.shares, t.price)) return;
  const sign = t.side === "buy" ? 1 : -1;
  const positions = { ...s.positions, [t.symbol]: (s.positions[t.symbol] ?? 0) + sign * t.shares };
  if (positions[t.symbol] <= 1e-9) delete positions[t.symbol];
  write({
    ...s,
    cash: Math.round((s.cash - sign * t.shares * t.price) * 100) / 100,
    positions,
    trades: [{ ...t, at: new Date().toISOString() }, ...s.trades],
  });
}

export function usePractice() {
  return useSyncExternalStore(subscribe, read, () => null);
}
