"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { HeroLoop } from "@/components/landing/Loops";
import { Stage } from "@/components/briefing/Stage";
import { api, EXAMPLE_PORTFOLIO, type CompanyDetail, type PortfolioOut } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { useHoldings } from "@/lib/holdings";
import { portfolioExtras, useOtherAssets } from "@/lib/other-assets";

// The three tiles below the hero: the rest of what Precedence does, one line each (owner's trim).
const TILES: [string, string, string][] = [
  ["Signals", "Every past time, and what followed.", "/signals?t=BX&s=rate_jump"],
  ["Stock pages", "Chart, filings and financials for one stock.", "/company/BX"],
  ["Paper trading", "Try a trade with pretend money.", "/paper"],
];

// Brief: "more accessible … engaging" · "understanding what they own". Trimmed to the hero, the portfolio
// card and 3 tiles (owner's call) — the bands that used to run below are gone.
export default function Home() {
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});
  const [mine] = useHoldings(null); // your saved holdings: the portfolio card shows your total, not the example
  const other = useOtherAssets();
  const extras = JSON.stringify(portfolioExtras(other));
  const [myBoard, setMyBoard] = useState<PortfolioOut | null>(null);
  const mineKey = mine?.length ? JSON.stringify(mine) : "";
  useEffect(() => {
    if (!mineKey) return;
    api.portfolio(JSON.parse(mineKey), JSON.parse(extras)).then(setMyBoard).catch(() => {});
  }, [mineKey, extras]);
  const returning = !!mine?.length;

  useEffect(() => {
    api.portfolio(EXAMPLE_PORTFOLIO).then(setBoard).catch(() => {});
    Promise.all(EXAMPLE_PORTFOLIO.map((h) => api.company(h.symbol).then((d) => [h.symbol, d.prices.slice(-30)] as const).catch(() => null)))
      .then((p) => setSparks(Object.fromEntries(p.filter((x) => x !== null))));
  }, []);

  return (
    <div className="home">
      {/* ---- hero + the example portfolio ---- */}
      <section className="home-band home-hero" aria-label="Precedence">
        <div className="home-hero-bg" aria-hidden><HeroLoop /></div>
        <div className="home-inner home-hero-grid">
          <div className="stack" style={{ gap: 20 }}>
            <h1>Your wealth, governed with clarity.</h1>
            <p className="lede">
              See whether news like today&rsquo;s has come before a drop for the stocks you own. It doesn&rsquo;t predict.{" "}
              <Link className="home-link" href="/signals">How we check</Link>
            </p>
            <div className="home-ctas">
              {returning ? <>
                <Link className="btn" href="/portfolio">Open your portfolio</Link>
                <Link className="btn light" href="/import">Add more</Link>
              </> : <>
                <Link className="btn" href="/import?example=1">Try it with an example</Link>
                <Link className="btn light" href="/import">Add your account</Link>
              </>}
            </div>
            {/* The briefing, in the hero: yours when you've added holdings, the example until then. */}
            <Stage fallback={EXAMPLE_PORTFOLIO} compact />
          </div>
          {returning ? (
            // Coming back: your own total first, never the example.
            <Link className="card home-example" href="/portfolio" aria-label="Your portfolio: open it">
              <span className="home-example-top"><span className="kicker">Your portfolio</span>
                <span className="note">{myBoard?.price_as_of ? `Close ${shortDate(myBoard.price_as_of)}` : "Loading…"}</span></span>
              <span className="bignum price home-example-total">{myBoard ? money(myBoard.subtotals?.total ?? myBoard.total) : "—"}</span>
              {myBoard?.subtotals?.includes_home_estimate && <span className="note">Includes a home estimate</span>}
              {/* Your three largest holdings, with their badges. */}
              {[...(myBoard?.rows ?? [])].sort((a, b) => b.value - a.value).slice(0, 3).map((r) => {
                const e = myBoard?.exposure.find((x) => x.symbol === r.symbol);
                return (
                  <span className="home-example-row" key={r.symbol}>
                    <span><b>{r.symbol}</b><small className="note">{r.name}</small></span>
                    <span />
                    <span className="home-num">{money(r.value)}
                      <small className={r.change != null && r.change < 0 ? "down" : "up"}>{r.change != null ? pct(r.change) : ""}</small></span>
                    {e ? <StateBadge state={e.state} /> : <span />}
                  </span>
                );
              })}
              <span className="note">Open your portfolio ›</span>
            </Link>
          ) : (
          <Link className="card home-example" href="/import?example=1" aria-label="Example portfolio: open it">
            <span className="home-example-top"><span className="kicker">Example</span>
              <span className="note">{board?.price_as_of ? `Close ${shortDate(board.price_as_of)}` : "Loading…"}</span></span>
            <span className="bignum home-example-total">{board ? money(board.total) : "—"}</span>
            {EXAMPLE_PORTFOLIO.map((h) => {
              const row = board?.rows.find((r) => r.symbol === h.symbol);
              const e = board?.exposure.find((x) => x.symbol === h.symbol);
              const spk = sparks[h.symbol];
              const down = spk && spk.length > 1 && spk[spk.length - 1].close < spk[0].close;
              return (
                <span className="home-example-row" key={h.symbol}>
                  <span><b>{h.symbol}</b><small className="note">{h.shares} shares</small></span>
                  <span className={down ? "down" : "up"}>{spk ? <Spark closes={spk.map((p) => p.close)} /> : <span className="spark" />}</span>
                  <span className="home-num">{row ? money(row.value) : "—"}
                    <small className={row?.change != null && row.change < 0 ? "down" : "up"}>{row?.change != null ? pct(row.change) : ""}</small></span>
                  {e ? <StateBadge state={e.state} /> : <span />}
                </span>
              );
            })}
            <span className="note pro-only">Prices from Alpaca (IEX); badges from our tests on SEC and FRED data.</span>
          </Link>
          )}
        </div>
      </section>

      {/* ---- the rest of what Precedence does, one tile each ---- */}
      <section className="home-band" aria-label="More">
        <div className="home-inner">
          <div className="tiles">
            {TILES.map(([t, s, href]) => (
              <Link key={t} className="tile" href={href} style={{ textDecoration: "none" }}>
                <b>{t}</b><span>{s}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
