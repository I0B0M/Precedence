"use client";

import { useMode } from "@/lib/mode";
import { shortDate } from "@/lib/format";

export interface Pin {
  day: string;
  label: string;
}

interface Props {
  prices: { day: string; close: number }[];
  pins?: Pin[];
}

/** Lite: just the line. Pro: price gridlines plus numbered pins for filings and signal events. */
export function PriceChart({ prices, pins = [] }: Props) {
  const { mode } = useMode();
  const pro = mode === "pro";
  if (prices.length < 2) return <p className="note">No price history yet.</p>;

  const W = 640, H = pro ? 230 : 150, L = 4, R = pro ? 52 : 4, T = 16, B = pro ? 24 : 8;
  const closes = prices.map((p) => p.close);
  let lo = Math.min(...closes), hi = Math.max(...closes);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const x = (i: number) => L + (i / (prices.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = prices.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join("");

  const index = new Map(prices.map((p, i) => [p.day, i]));
  const placed = pro
    ? pins.map((pin) => {
        // a pin lands on its day, or the next trading day if it came out on a weekend or after the last bar
        let i = index.get(pin.day);
        if (i === undefined) i = prices.findIndex((p) => p.day >= pin.day);
        return i >= 0 ? { ...pin, i } : null;
      }).filter((p): p is Pin & { i: number } => p !== null)
    : [];

  const first = prices[0].day, last = prices[prices.length - 1].day;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price from ${shortDate(first)} to ${shortDate(last)}`}>
        {pro && [0, 1, 2, 3].map((k) => {
          const v = lo + ((hi - lo) * k) / 3, yy = y(v);
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--line)" />
              <text x={W - R + 6} y={yy} fontSize="11" fill="var(--mute)" dominantBaseline="central">${v.toFixed(0)}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(prices.length - 1)} cy={y(closes[closes.length - 1])} r="4" fill="var(--ink)" />
        {placed.map((p, j) => (
          <g key={j}>
            <circle cx={x(p.i)} cy={y(prices[p.i].close)} r="6" fill="var(--hl)" stroke="var(--ink)" strokeWidth="1.5">
              <title>{p.label}</title>
            </circle>
            <text x={x(p.i)} y={y(prices[p.i].close) - 11} fontSize="10.5" textAnchor="middle" fill="var(--ink)">{j + 1}</text>
          </g>
        ))}
        {pro && (
          <>
            <text x={L} y={H - 6} fontSize="11" fill="var(--mute)">{shortDate(first)}</text>
            <text x={W - R} y={H - 6} fontSize="11" fill="var(--mute)" textAnchor="end">{shortDate(last)}</text>
          </>
        )}
      </svg>
      {placed.length > 0 && (
        <ol className="note" style={{ paddingLeft: 18, margin: "6px 0 0" }}>
          {placed.map((p, j) => <li key={j}>{p.label}</li>)}
        </ol>
      )}
    </div>
  );
}
