"use client";

import { useState } from "react";
import type { PortfolioOut } from "@/lib/api";
import { approxMoney, money, sharePct as share } from "@/lib/format";

// Categorical order is fixed: stocks, funds, 401(k)/IRA, home. None is a colour with a meaning elsewhere (Heads-up gold,
// Calm blue, up green, down red). Checked with the dataviz palette validator on #0b0b0c and #141416: every check passes
// for adjacent pairs (worst CVD ΔE 10.3), which is what a single stacked bar needs; funds and home never touch.
const PARTS = [
  { key: "stocks", label: "Stocks", color: "#009aa8" },
  { key: "funds", label: "Funds", color: "#7c60bd" },
  { key: "retirement", label: "401(k) and IRA", color: "#bd7138" },
  { key: "home", label: "Home (estimate)", color: "#ac4e87" },
] as const;

/** Everything you own, split four ways, as one bar. Shown when at least two parts have money in them. */
export function Allocation({ board }: { board: PortfolioOut }) {
  // With a home the bar is nearly all home, so offer the same bar without it.
  const [invest, setInvest] = useState(false);
  const sum = (kind: string) => board.rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.value, 0);
  const value: Record<(typeof PARTS)[number]["key"], number> = {
    stocks: sum("stock"),
    // BREIT / BCRED are funds too: their entered amount joins this part (subtotals.private_funds, when the API sends it).
    funds: sum("etf") + ((board.subtotals as { private_funds?: number } | undefined)?.private_funds ?? 0),
    retirement: board.subtotals?.retirement ?? 0,
    home: board.subtotals?.home_estimate ?? 0,
  };
  const hasHome = value.home > 0;
  const shown = PARTS.filter((p) => value[p.key] > 0 && !(invest && p.key === "home"));
  const total = shown.reduce((a, p) => a + value[p.key], 0);
  const parts = shown;
  const dollars = (k: string) => (k === "home" ? `About ${approxMoney(value.home)}` : money(value[k as keyof typeof value]));
  if (PARTS.filter((p) => value[p.key] > 0).length < 2 || total <= 0) return null;

  return (
    <div className="alloc-wrap">
      {hasHome && (
        <div className="seg-choice alloc-scope" role="group" aria-label="Show">
          <button type="button" aria-pressed={!invest} onClick={() => setInvest(false)}>Everything</button>
          <button type="button" aria-pressed={invest} onClick={() => setInvest(true)}>Investments</button>
        </div>
      )}
      <div className="alloc" role="img"
        aria-label={`What you own: ${parts.map((p) => `${p.label} ${dollars(p.key)}, ${share(value[p.key] / total)}`).join("; ")}`}>
        {parts.map((p) => (
          <span key={p.key} className="alloc-seg" title={`${p.label}: ${dollars(p.key)} (${share(value[p.key] / total)})`}
            style={{ flexGrow: value[p.key], background: p.color }} />
        ))}
      </div>
      <ul className="alloc-key">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} aria-hidden />
            <span>{p.label}</span>
            <b>{dollars(p.key)}</b>
            <span className="mute">{share(value[p.key] / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
