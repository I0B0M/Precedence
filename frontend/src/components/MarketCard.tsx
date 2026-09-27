"use client";

import { useEffect, useState } from "react";
import { HoldoutNote, Verdict } from "@/components/bits";
import { api, type MarketResult } from "@/lib/api";
import { dateTimeET, horizonWords, whole } from "@/lib/format";
import { liteMarket } from "@/lib/words";

/** The rate-jump test run on the market itself (SPY). A rate jump hits every stock on the same days,
 *  so the per-stock result is measured against this. `onlyFor`: show it only on that symbol's page. */
export function MarketCard({ onlyFor }: { onlyFor?: string }) {
  const [m, setM] = useState<MarketResult | null>(null);
  useEffect(() => {
    api.marketRateJump().then(setM).catch(() => setM(null));
  }, []);
  if (!m || (onlyFor && m.symbol !== onlyFor)) return null;

  return (
    <div className="market">
      <p className="lite-only">
        {liteMarket(m)}
      </p>
      <div className="pro-only stack" style={{ gap: 10 }}>
        <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
          <b>{m.pro}</b>
          <span><Verdict s={m} /></span>
        </div>
        <dl className="stats">
          <div><dt>Cases</dt><dd>{m.n}</dd></div>
          <div><dt>Lower after {horizonWords(m.horizon)}</dt><dd>{m.hits} ({whole(m.hit_rate)})</dd></div>
          <div><dt>Normal {horizonWords(m.horizon).replace("a ", "")}s</dt><dd>{whole(m.normal_rate)} <span className="note">of {m.normal_n}</span></dd></div>
          <div><dt>90% range</dt><dd>{whole(m.low)}–{whole(m.high)}</dd></div>
        </dl>
        <p className="note">Hold-out: <HoldoutNote s={m} /></p>
        {m.firing && <p className="note"><b>Firing:</b> {m.firing.note} · known {dateTimeET(m.firing.known_at)}</p>}
      </div>
    </div>
  );
}
