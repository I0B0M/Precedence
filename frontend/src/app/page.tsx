"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { api, type CompanyDetail, type PortfolioOut, type SignalResult } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { PRACTICE_CASH } from "@/lib/practice";

// The example the landing shows, and the one /import?example=1 fills in.
const EXAMPLE = [{ symbol: "BX", shares: 10 }, { symbol: "AMZN", shares: 5 }, { symbol: "SPY", shares: 3 }];

// Brief: "more accessible … engaging" · "understanding what they own"
export default function Landing() {
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});
  const [lab, setLab] = useState<SignalResult | null>(null);

  useEffect(() => {
    api.portfolio(EXAMPLE).then(setBoard).catch(() => {});
    Promise.all(EXAMPLE.map((h) => api.company(h.symbol).then((d) => [h.symbol, d.prices.slice(-30)] as const).catch(() => null)))
      .then((p) => setSparks(Object.fromEntries(p.filter((x) => x !== null))));
    api.lab("BX", "rate_jump").then(setLab).catch(() => {});
  }, []);

  return (
    <section className="land">
      <div className="land-hero">
        <div className="land-copy">
          <h1 className="land-title">See what&apos;s happening to what you own, and whether it has ever mattered.</h1>
          <div className="land-cta">
            <Link className="btn t-go" href="/import?example=1">Try it with an example</Link>
            <Link className="btn light t-go" href="/import">Add your account</Link>
          </div>
        </div>
        <ExampleCard board={board} sparks={sparks} />
      </div>

      <div className="land-cards">
        <Link href="/portfolio" className="land-card">
          <div className="land-vis">
            <span className="badge watch"><span className="lite-only">Heads up</span><span className="pro-only">WATCH</span></span>
            <span className="badge calm"><span className="lite-only">Calm</span><span className="pro-only">CALM</span></span>
          </div>
          <span className="kicker">Portfolio</span>
          <p>Everything you own, with the one thing worth a look.</p>
        </Link>
        <Link href="/signals?t=BX&s=rate_jump" className="land-card">
          <div className="land-vis hitdots" aria-hidden>
            {(lab?.cases ?? []).map((c, i) => <i key={i} className={c.hit ? "h" : undefined} style={{ "--i": i } as React.CSSProperties} />)}
          </div>
          <span className="kicker">Signals</span>
          <p>Every past time the news happened, and what the stock did next.</p>
        </Link>
        <Link href="/paper" className="land-card">
          <div className="land-vis"><span className="land-paper">{money(PRACTICE_CASH)}</span></div>
          <span className="kicker">Paper trading</span>
          <p>Try a trade with pretend money. Nothing is ever sent.</p>
        </Link>
      </div>
    </section>
  );
}

/** The live example: real prices and badges for BX 10 · AMZN 5 · SPY 3. */
function ExampleCard({ board, sparks }: { board: PortfolioOut | null; sparks: Record<string, CompanyDetail["prices"]> }) {
  return (
    <div className="land-example" aria-label="Example portfolio">
      <div className="row-flex" style={{ justifyContent: "space-between" }}>
        <span className="kicker">Example</span>
        <span className="note">{board?.price_as_of ? `Close ${shortDate(board.price_as_of)}` : "Loading…"}</span>
      </div>
      <div className="pf-total">{board ? money(board.total) : "—"}</div>
      <div className="land-rows">
        {EXAMPLE.map((h) => {
          const row = board?.rows.find((r) => r.symbol === h.symbol);
          const e = board?.exposure.find((x) => x.symbol === h.symbol);
          const spk = sparks[h.symbol];
          const down = spk && spk.length > 1 && spk[spk.length - 1].close < spk[0].close;
          return (
            <div key={h.symbol} className="land-row">
              <span><b>{h.symbol}</b> <span className="mute">{h.shares} shares</span></span>
              <span className={down ? "down" : "up"}>{spk ? <Spark closes={spk.map((p) => p.close)} /> : <span className="spark" />}</span>
              <span className="num">
                {row ? money(row.value) : "—"}
                <small className={row?.change != null && row.change < 0 ? "down" : "up"}>{row?.change != null ? pct(row.change) : ""}</small>
              </span>
              {e ? <StateBadge state={e.state} /> : <span />}
            </div>
          );
        })}
      </div>
      <p className="note">Prices from Alpaca (IEX); badges from Stone&apos;s tests on SEC and FRED data.</p>
    </div>
  );
}
