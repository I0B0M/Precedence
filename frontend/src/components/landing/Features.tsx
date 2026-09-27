"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dots } from "@/components/Compare";
import { api, type CompanyDetail } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { PRACTICE_CASH } from "@/lib/practice";

// The landing's three features, each a card with a small live picture from the same data as its page:
// BX's rate-jump history (Signals), AMZN's two years of closes (Stock pages), a practice trade at AMZN's close (Paper trading).

const TRY_SHARES = 4; // the example trade on the Paper trading card

function Line({ closes }: { closes: number[] }) {
  if (closes.length < 2) return <div className="feat-line" />;
  const W = 300, H = 72, lo = Math.min(...closes), hi = Math.max(...closes), r = hi - lo || 1;
  const d = closes.map((c, i) => `${i ? "L" : "M"}${((i / (closes.length - 1)) * W).toFixed(1)},${(H - 3 - ((c - lo) / r) * (H - 6)).toFixed(1)}`).join("");
  return (
    <svg className="feat-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Features() {
  const [bx, setBx] = useState<CompanyDetail | null>(null);
  const [amzn, setAmzn] = useState<CompanyDetail | null>(null);
  useEffect(() => {
    api.company("BX").then(setBx).catch(() => {});
    api.company("AMZN").then(setAmzn).catch(() => {});
  }, []);

  const rate = bx?.signals.find((s) => s.signal === "rate_jump" && s.n > 0) ?? null;
  const usual = rate?.normal_rate != null ? Math.round(rate.normal_rate * rate.n) : null;
  const period = rate ? (rate.horizon === 5 ? "week" : rate.horizon === 20 ? "month" : `${rate.horizon} days`) : "";
  const closes = amzn?.prices.map((p) => p.close) ?? [];
  const up = closes.length > 1 && closes[closes.length - 1] >= closes[0];
  const px = amzn?.last?.close ?? null;
  const cost = px != null ? TRY_SHARES * px : null;

  return (
    <div className="features">
      <Link className="card feat" href="/signals?t=BX&s=rate_jump">
        <span className="kicker">Signals</span>
        <h3>Has this come before a drop?</h3>
        <p className="mute">Every past time a piece of news hit a stock, and what the price did next.</p>
        {rate && (
          <div className="feat-visual feat-dots" aria-label={`BX after a rate jump: ${rate.hits} of ${rate.n} lower${usual != null ? `; about ${usual} of ${rate.n} in a normal ${period}` : ""}`}>
            <span className="feat-row"><span className="note">BX after a rate jump</span><b>{rate.hits} of {rate.n}</b></span>
            <Dots n={rate.n} filled={rate.hits} tone="event" />
            {usual != null && <>
              <span className="feat-row"><span className="note">In a normal {period}</span><b>about {usual}</b></span>
              <Dots n={rate.n} filled={usual} tone="normal" />
            </>}
          </div>
        )}
        <span className="feat-go">Open Signals ›</span>
      </Link>

      <Link className="card feat" href="/company/AMZN">
        <span className="kicker">Stock pages</span>
        <h3>One stock, its prices and its filings</h3>
        <p className="mute">Two years of daily closes, with each past signal marked under the line.</p>
        {amzn && (
          <div className="feat-visual">
            <span className="feat-row feat-price"><b>AMZN</b><b>{px != null ? money(px, true) : "—"}</b></span>
            <span className={up ? "up" : "down"}><Line closes={closes} /></span>
            <span className="note">Daily closes to {amzn.last ? shortDate(amzn.last.day) : "the latest close"}</span>
          </div>
        )}
        <span className="feat-go">Open Amazon ›</span>
      </Link>

      <Link className="card feat" href="/paper">
        <span className="kicker">Paper trading</span>
        <h3>Try a trade with pretend money</h3>
        <p className="mute">{money(PRACTICE_CASH)} of practice cash. No order is ever sent.</p>
        {cost != null && px != null && (
          <div className="feat-visual feat-trade">
            <span className="feat-row"><span>Buy {TRY_SHARES} AMZN at {money(px, true)}</span><b>{money(cost, true)}</b></span>
            <span className="feat-row note"><span>Practice cash left</span><span>{money(PRACTICE_CASH - cost, true)} of {money(PRACTICE_CASH)}</span></span>
          </div>
        )}
        <span className="feat-go">Open Paper trading ›</span>
      </Link>
    </div>
  );
}
