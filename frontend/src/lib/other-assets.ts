"use client";

import { useSyncExternalStore } from "react";
import type { FundLookup, HomeEstimate, PortfolioIn, PropertyIn, RetirementIn } from "./api";
import { SHOW_PRIVATE_FUNDS } from "./flags";
import type { PrivateFundIn, PrivateFundKey } from "./private-funds";

// Things you own beyond brokerage holdings: a home, 401(k) / IRA funds, crypto (hidden for now). Kept in this browser,
// like holdings; the API is stateless, so portfolioExtras() sends them with every POST /api/portfolio.
const KEY = "stone.other";

export interface Property {
  id: string;
  address: string; // a street address or a 5-digit ZIP, as typed
  paid: number;
  bought: string; // "YYYY" (older saves: "YYYY-MM"); only the year is used
  estimate?: HomeEstimate | null; // from POST /api/estimate/home; absent until an estimate succeeds
}
export interface RetirementFund {
  id: string;
  account: "401(k)" | "IRA";
  name: string; // as typed
  amount: number;
  lookup?: FundLookup | null; // from GET /api/funds/lookup; absent if the lookup didn't answer
}
export interface CryptoHolding { id: string; kind: "crypto"; symbol: string; amount: number } // amount may be fractional
export interface PrivateFund { id: string; fund: PrivateFundKey; amount: number } // BREIT / BCRED, dollars as entered
export interface OtherAssets { properties: Property[]; retirement: RetirementFund[]; crypto: CryptoHolding[]; privateFunds: PrivateFund[] }

const EMPTY: OtherAssets = { properties: [], retirement: [], crypto: [], privateFunds: [] };
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

// Older saves used place / price for a home.
type Stored = { properties?: (Partial<Property> & { id: string; bought: string; place?: string; price?: number })[]; retirement?: RetirementFund[]; crypto?: CryptoHolding[]; privateFunds?: PrivateFund[] };

function read(): OtherAssets {
  const r = raw();
  if (r !== cachedRaw) {
    cachedRaw = r;
    try {
      const v = (r ? JSON.parse(r) : EMPTY) as Stored;
      cached = {
        properties: (v.properties ?? []).map((p) => ({ id: p.id, bought: p.bought, estimate: p.estimate ?? null, address: p.address ?? p.place ?? "", paid: p.paid ?? p.price ?? 0 })),
        retirement: v.retirement ?? [],
        crypto: v.crypto ?? [],
        privateFunds: v.privateFunds ?? [],
      };
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

export function addPrivateFund(fund: PrivateFundKey, amount: number) {
  const v = read();
  write({ ...v, privateFunds: [...v.privateFunds, { id: newId(), fund, amount }] });
}

export function removeOther(id: string) {
  const v = read();
  write({
    properties: v.properties.filter((p) => p.id !== id),
    retirement: v.retirement.filter((r) => r.id !== id),
    crypto: v.crypto.filter((c) => c.id !== id),
    privateFunds: v.privateFunds.filter((f) => f.id !== id),
  });
}

export function useOtherAssets() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** What POST /api/portfolio needs besides the stock holdings. A home without an estimate isn't sent (the API needs one). */
export function portfolioExtras(v: OtherAssets = read()): Omit<PortfolioIn, "holdings"> {
  const homes: PropertyIn[] = v.properties.filter((p) => p.estimate?.estimate != null).map((p) => ({
    kind: "property", label: p.estimate?.address_matched ?? p.address, address: p.address, paid: p.paid,
    bought_year: Number(p.bought.slice(0, 4)), estimate: p.estimate!.estimate, source: p.estimate!.source, as_of: p.estimate!.as_of,
  }));
  const funds: RetirementIn[] = v.retirement.map((r) => ({ kind: "retirement", fund: r.lookup?.ticker ?? r.name, amount: r.amount, account: r.account }));
  const priv: PrivateFundIn[] = SHOW_PRIVATE_FUNDS ? v.privateFunds.map((f) => ({ kind: "private_fund", fund: f.fund, amount: f.amount })) : [];
  const other = [...homes, ...funds, ...priv];
  return other.length ? { other: other as NonNullable<PortfolioIn["other"]> } : {};
}
