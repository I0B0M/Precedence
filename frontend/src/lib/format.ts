export function money(v: number | null | undefined, cents = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return (v < 0 ? "−$" : "$") + abs;
}

/** An estimate, rounded so it doesn't look exact: $1.33M, $412K. */
export function approxMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : a.toFixed(0);
  return (v < 0 ? "−$" : "$") + s;
}

/** Big dollar figures from filings: $4.21B, $612M. */
export function bigMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = a >= 1e12 ? `${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(a / 1e9).toFixed(2)}B`
    : a >= 1e6 ? `${(a / 1e6).toFixed(0)}M` : a.toLocaleString("en-US");
  return (v < 0 ? "−$" : "$") + s;
}

export function pct(v: number | null | undefined, signed = true, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  const s = Math.abs(v * 100).toFixed(digits) + "%";
  if (!signed) return s;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
}

export function whole(v: number | null | undefined): string {
  return v == null ? "—" : Math.round(v * 100) + "%";
}

/** A share of a total that never reads "0%" for real money: 99%, 1%, 0.3%, under 0.1%. */
export function sharePct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v <= 0) return "0%";
  return v >= 0.01 ? whole(v) : v >= 0.001 ? `${(v * 100).toFixed(1)}%` : "under 0.1%";
}

/** Trading-day horizon in plain words. */
export function horizonWords(days: number): string {
  if (days === 5) return "a week";
  if (days === 20) return "a month";
  return `${days} trading days`;
}

export function shortDate(iso: string): string {
  return new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function dateTimeET(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }) + " ET";
}

/** "5:00 PM ET" */
export function timeET(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
}

/** "BX", "BX and SPY", "BX, AMZN and SPY". */
export const andList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "");
