"use client";

import { useEffect, useState } from "react";
import { api, type Holding, type PortfolioRisk } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";

const x = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}×`);
const n2 = (v: number) => v.toFixed(2);

/** How bumpy this mix has been, next to the market. QuantStats on Stone's daily closes (POST /api/portfolio/risk).
 *  Brief: "analyze their existing portfolio" · "visualize performance". */
export function RiskCard({ holdings }: { holdings: Holding[] }) {
  const key = JSON.stringify(holdings);
  const [got, setGot] = useState<{ key: string; r: PortfolioRisk | null } | null>(null);
  useEffect(() => {
    api.risk(holdings).then((r) => setGot({ key, r })).catch(() => setGot({ key, r: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const r = got?.key === key ? got.r : null;
  if (!r) return null;
  const p = r.portfolio, m = r.market;
  const beta = p.beta;
  const bumpier = beta == null ? null : beta >= 1.1 ? "more than" : beta <= 0.9 ? "less than" : "about as much as";

  return (
    <div className="card risk" id="risk" data-tour="risk">
      <h3>How bumpy it&apos;s been</h3>
      <div className="lite-only stack" style={{ gap: 10 }}>
        <p className="say-big">
          Worst drop from a high: <b className="down">{pct(p.max_drawdown)}</b>
          {p.max_drawdown_dollars != null && <> (<b className="down">{money(Math.abs(p.max_drawdown_dollars))}</b> at today&apos;s total)</>},
          {" "}{shortDate(p.drawdown_start)} to {shortDate(p.drawdown_bottom)}.
        </p>
        {bumpier && beta != null && (
          <p className="say-big">It moves <b>{bumpier}</b> the market: about {beta.toFixed(1)}× {r.market_symbol}&apos;s daily moves.</p>
        )}
      </div>
      <div className="pro-only tscroll">
        <table>
          <thead><tr><th /><th className="num">Your mix</th><th className="num">{r.market_symbol}</th></tr></thead>
          <tbody>
            <tr><td>Volatility (annualised)</td><td className="num">{pct(p.volatility, false)}</td><td className="num">{pct(m.volatility, false)}</td></tr>
            <tr><td>Max drawdown<div className="note">{shortDate(p.drawdown_start)} → {shortDate(p.drawdown_bottom)}</div></td>
              <td className="num down">{pct(p.max_drawdown)}</td><td className="num down">{pct(m.max_drawdown)}</td></tr>
            <tr><td>Beta vs {r.market_symbol}</td><td className="num">{x(beta)}</td><td className="num">1.00×</td></tr>
            <tr><td>Sharpe (rf 0%)</td><td className="num">{n2(p.sharpe)}</td><td className="num">{n2(m.sharpe)}</td></tr>
            <tr><td>Worst day</td><td className="num down">{pct(p.worst_day)}<div className="note">{shortDate(p.worst_day_on)}</div></td>
              <td className="num down">{pct(m.worst_day)}<div className="note">{shortDate(m.worst_day_on)}</div></td></tr>
            <tr><td>Return, whole period</td><td className="num">{pct(p.total_return)}</td><td className="num">{pct(m.total_return)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        {r.days} trading days, {shortDate(r.start)} to {shortDate(r.end)}. Basis: {r.basis}. {r.source}.
        {r.unknown.length > 0 && ` Left out (no prices): ${r.unknown.join(", ")}.`}
      </p>
    </div>
  );
}
