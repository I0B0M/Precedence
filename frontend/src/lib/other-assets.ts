"use client";

import { useSyncExternalStore } from "react";

// Things you own that the API can't value yet: a home, a 401(k) or IRA, crypto. Kept in this browser until the backend
// returns kind="property" / "retirement" / "crypto" rows. We store only what the person typed; no values are estimated here.
const KEY = "stone.other";

export interface Property { id: string; place: string; price: number; bought: string } // bought: "YYYY-MM"
export interface RetirementFund { id: string; account: "401(k)" | "IRA"; name: string; amount: number }
export interface CryptoHolding { id: string; kind: "crypto"; symbol: string; amount: number } // amount may be fractional
export interface OtherAssets { properties: Property[]; retirement: RetirementFund[]; crypto: CryptoHolding[] }

const EMPTY: OtherAssets = { properties: [], retirement: [], crypto: [] };
let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cached: OtherAssets = EMPTY;
const listeners = new Set<() => void>();

function raw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function read(): OtherAssets {
  const r = raw();
  if (r !== cachedRaw) {
    cachedRaw = r;
    try {
      const v = r ? (JSON.parse(r) as OtherAssets) : EMPTY;
      cached = { properties: v.properties ?? [], retirement: v.retirement ?? [], crypto: v.crypto ?? [] };
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function write(v: OtherAssets) {
  memory = JSON.stringify(v);
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

const newId = () => Math.random().toString(36).slice(2, 10);

export function addProperty(p: Omit<Property, "id">) {
  const v = read();
  write({ ...v, properties: [...v.properties, { ...p, id: newId() }] });
}

export function addRetirement(rows: Omit<RetirementFund, "id">[]) {
  const v = read();
  write({ ...v, retirement: [...v.retirement, ...rows.map((r) => ({ ...r, id: newId() }))] });
}

export function addCrypto(rows: { symbol: string; amount: number }[]) {
  const v = read();
  write({ ...v, crypto: [...v.crypto, ...rows.map((r) => ({ ...r, kind: "crypto" as const, id: newId() }))] });
}

export function removeOther(id: string) {
  const v = read();
  write({
    properties: v.properties.filter((p) => p.id !== id),
    retirement: v.retirement.filter((r) => r.id !== id),
    crypto: v.crypto.filter((c) => c.id !== id),
  });
}

export function useOtherAssets() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
