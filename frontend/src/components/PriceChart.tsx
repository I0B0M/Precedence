"use client";

import { useEffect, useRef, useState } from "react";
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

/** Lite: just the line, in neutral ink (colour lives on the change figure). Pro: price gridlines plus numbered pins for filings and signal events.
 *  Drawn at the container's real width so labels stay legible on a phone. */
export function PriceChart({ prices, pins = [] }: Props) {
  const { mode } = useMode();
  const pro = mode === "pro";
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (prices.length < 2) return <p className="note">No price history yet.</p>;

  const W = w, H = Math.round(pro ? Math.min(260, Math.max(190, w * 0.42)) : Math.min(200, Math.max(130, w * 0.32)));
  const L = 2, R = pro ? 46 : 2, T = pro ? 22 : 8, B = pro ? 22 : 6;
  const closes = prices.map((p) => p.close);
  let lo = Math.min(...closes), hi = Math.max(...closes);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const x = (i: number) => L + (i / (prices.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = prices.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join("");
  const line = "var(--text)";

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
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Price from ${shortDate(first)} to ${shortDate(last)}`}>
        {pro && [0, 1, 2, 3].map((k) => {
          const v = lo + ((hi - lo) * k) / 3, yy = y(v);
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--sep)" />
              <text x={W - R + 6} y={yy} fontSize="11" fill="var(--text-2)" dominantBaseline="central">${v.toFixed(0)}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke={line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(prices.length - 1)} cy={y(closes[closes.length - 1])} r="4" fill={line} />
        {placed.map((p, j) => (
          <g key={j}>
            <circle cx={x(p.i)} cy={y(prices[p.i].close)} r="6" fill="var(--accent)" stroke="var(--group)" strokeWidth="2">
              <title>{p.label}</title>
            </circle>
            <text x={x(p.i)} y={y(prices[p.i].close) - 12} fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--text)">{j + 1}</text>
          </g>
        ))}
        {pro && (
          <>
            <text x={L} y={H - 4} fontSize="11" fill="var(--text-2)">{shortDate(first)}</text>
            <text x={W - R} y={H - 4} fontSize="11" fill="var(--text-2)" textAnchor="end">{shortDate(last)}</text>
          </>
        )}
      </svg>
      {placed.length > 0 && (
        <ol className="pins">
          {placed.map((p, j) => <li key={j}><span className="pin">{j + 1}</span>{p.label}</li>)}
        </ol>
      )}
    </div>
  );
}
