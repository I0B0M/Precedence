"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type CompanyRow } from "@/lib/api";
import { money } from "@/lib/format";
import { PRACTICE_CASH, usePractice } from "@/lib/practice";

/** The portfolio's Practice section: what practice trades changed, at the last close, and the practice cash left.
 *  Pretend money, kept out of the real total. Shown only once a practice trade exists, so Reset on /paper clears it. */
export function PracticeRows() {
  const s = usePractice();
  const active = !!s && s.trades.length > 0;
  const [cos, setCos] = useState<CompanyRow[] | null>(null);
  useEffect(() => {
    if (active && !cos) api.companies().then(setCos).catch(() => {});
  }, [active, cos]);
  if (!s || !active) return null;

  const seeded = s.seeded ?? {};
  const px = (sym: string) => cos?.find((c) => c.ticker === sym)?.last_close ?? null;
  // Only what practice changed: holdings copied in from the portfolio at the start aren't repeated here.
  const changes = [...new Set([...Object.keys(s.positions), ...Object.keys(seeded)])]
    .map((sym) => ({ sym, d: (s.positions[sym] ?? 0) - (seeded[sym] ?? 0), name: cos?.find((c) => c.ticker === sym)?.name ?? "" }))
    .filter((x) => Math.abs(x.d) > 1e-9)
    .sort((a, b) => a.sym.localeCompare(b.sym));
  const shares = (n: number) => `${n} share${n === 1 ? "" : "s"}`;

  return (
    <div className="stack practice-rows" style={{ gap: 10, marginTop: 24 }}>
      <span className="ticker">Practice · pretend money</span>
      <p className="note" style={{ margin: 0 }}>Not in your total above. Kept in this browser only; no order is ever sent.</p>
      <div className="rows">
        {changes.map((c) => {
          const p = px(c.sym);
          return (
            <div key={c.sym} className="hitem">
              <div className="hrow other">
                <span className="who">
                  <span className="tk">{c.sym}</span>
                  <span className="nm">{c.name}</span>
                  <span className="say">{c.d > 0 ? `Bought ${shares(c.d)} in practice` : `Sold ${shares(-c.d)} in practice`}</span>
                </span>
                <span className="sp" aria-hidden />
                <span className="val">{p != null ? money(Math.abs(c.d) * p) : "—"}<small className="mute">at the last close</small></span>
                <span className="hend"><span className="practice-tag">Practice</span></span>
              </div>
            </div>
          );
        })}
        <div className="hitem">
          <div className="hrow other">
            <span className="who"><span className="tk">Cash</span><span className="nm">Practice cash left</span></span>
            <span className="sp" aria-hidden />
            <span className="val">{money(s.cash, true)}<small className="mute">of {money(PRACTICE_CASH)}</small></span>
            <span className="hend"><span className="practice-tag">Practice</span></span>
          </div>
        </div>
      </div>
      <Link className="linkb" href="/paper" style={{ alignSelf: "flex-start" }}>Open Paper trading ›</Link>
    </div>
  );
}
