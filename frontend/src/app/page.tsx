"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { api, type PortfolioOut, type Status } from "@/lib/api";
import { money, pct, whole } from "@/lib/format";
import { NO_HOLDINGS, SAMPLE_PORTFOLIO, useHoldings } from "@/lib/holdings";
import { liteSummary, proSummary } from "@/lib/words";

// Brief: "analyze their existing portfolio" · "understanding what they own" · "make decisions"
export default function HoldingsBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useHoldings(status ? (status.data === "sample" ? SAMPLE_PORTFOLIO : NO_HOLDINGS) : null);

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!holdings?.length) return;
    api.portfolio(holdings).then(setBoard).catch((e) => setError(e.message));
  }, [holdings]);

  if (error) return <div className="badline">Couldn&apos;t load your holdings: {error}</div>;
  if (holdings && !holdings.length) {
    return (
      <div className="empty">
        <h2>Nothing here yet</h2>
        <p className="mute">Bring in what you own and Stone will tell you the one thing that matters today.</p>
        <Link className="btn" href="/import">Bring holdings in</Link>
      </div>
    );
  }
  if (!board) return <p className="mute">Loading what you own…</p>;

  const watching = board.exposure.filter((e) => e.state === "WATCH").length;
  return (
    <section>
      <div className="pf-head">
        <div className="stack" style={{ gap: 8 }}>
          <span className="ticker"><span className="greendot" />Everything you own</span>
          <div className="bignum">{money(board.total)}</div>
          <p className="mute">
            <span className="lite-only">
              {watching ? `${watching} thing${watching > 1 ? "s" : ""} worth a look today.` : "Nothing needs you today."}
            </span>
            <span className="pro-only">{board.exposure.length} exposures · {watching} on WATCH · ETF holdings looked through</span>
          </p>
        </div>
        <p className="note" style={{ maxWidth: "36ch" }}>
          <span className="lite-only">Tap a holding to see what&apos;s going on, in plain words.</span>
          <span className="pro-only">WATCH only when a signal that has proven itself on this stock is firing.</span>
        </p>
      </div>

      <div className="rows">
        {board.exposure.map((e) => {
          const row = board.rows.find((r) => r.symbol === e.symbol);
          const viaEtf = Object.values(e.via_etf).reduce((a, b) => a + b, 0);
          return (
            <Link key={e.symbol} href={`/company/${e.symbol}`} className="hrow">
              <span>
                <span className="tk">{e.symbol}</span>
                <span className="nm">{e.name}</span>
              </span>
              <span className="say">
                <span className="lite-only">{liteSummary(e.firing)}</span>
                <span className="pro-only">
                  {proSummary(e.firing)}
                  {viaEtf > 0 && ` · ${money(viaEtf)} via ${Object.keys(e.via_etf).join(", ")}`}
                  {e.bad_day_loss != null && ` · bad day ${money(e.bad_day_loss)}`}
                </span>
              </span>
              <span className="val">
                {money(e.total)}
                <small className={row?.change != null && row.change < 0 ? "down" : "up"}>
                  {row?.change != null ? `${pct(row.change)} today` : <span className="mute">{whole(e.share_of_total)} of total</span>}
                </small>
              </span>
              <StateBadge state={e.state} />
            </Link>
          );
        })}
      </div>

      {board.rows.some((r) => r.kind === "etf") && (
        <p className="note" style={{ marginTop: 10 }}>
          Funds are split into what they hold, so a stock you own through an index fund shows up here too.
        </p>
      )}
      {board.unknown.length > 0 && (
        <p className="badline" style={{ marginTop: 12 }}>No data yet for {board.unknown.join(", ")}.</p>
      )}
      <div className="row-flex" style={{ marginTop: 16 }}>
        <Link className="btn light small" href="/import">Change holdings</Link>
        {status?.data === "sample" && (
          <button className="linkb" type="button" onClick={() => setHoldings(SAMPLE_PORTFOLIO)}>Reset to the sample portfolio</button>
        )}
      </div>
    </section>
  );
}
