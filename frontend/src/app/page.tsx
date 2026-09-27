"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./landing.css";
import { StateBadge } from "@/components/bits";
import { ChartPanel, DotsArt, FundsPanel, IconChecked, IconHonest, IconSources, IconTested, Mark, PaperPanel, RangeArt } from "@/components/landing/Art";
import { HeroLoop, JoinLoop } from "@/components/landing/Loops";
import { Spark } from "@/components/HoldingsRail";
import { api, type CompanyDetail, type PortfolioOut } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { PRACTICE_CASH } from "@/lib/practice";

// The example the landing shows, and the one /import?example=1 fills in.
const EXAMPLE = [{ symbol: "BX", shares: 10 }, { symbol: "AMZN", shares: 5 }, { symbol: "SPY", shares: 3 }];

const Lockup = ({ word }: { word: string }) => (
  <div className="lp-lockup"><Mark /><b>Precedence</b> <i>{word}</i></div>
);

// Brief: "more accessible … engaging" · "understanding what they own"
export default function Landing() {
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});

  useEffect(() => {
    api.portfolio(EXAMPLE).then(setBoard).catch(() => {});
    Promise.all(EXAMPLE.map((h) => api.company(h.symbol).then((d) => [h.symbol, d.prices.slice(-30)] as const).catch(() => null)))
      .then((p) => setSparks(Object.fromEntries(p.filter((x) => x !== null))));
  }, []);

  return (
    <div className="lp">
      <p className="lp-announce">
        <span className="lp-announce-text"><b>Stone is now Precedence.</b> Same honest checks, new name and castle. Tap the castle to switch Lite and Pro. <Link className="lp-u" href="/learn">Learn more</Link></span>
      </p>

      <section className="lp-hero-wrap">
        <div className="lp-hero"><HeroLoop /><div className="lp-scrim" /></div>
        <div className="lp-hero-col">
          <Lockup word="for everyday investors" />
          <h1 className="lp-hero-title">See what&rsquo;s happening to what you own</h1>
          <p className="lp-hero-text">And whether it has ever mattered. Precedence checks every past time that kind of event happened for that stock, on real SEC, Fed and price data. It doesn&rsquo;t predict. <Link className="lp-u" href="/learn">How we check</Link></p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="lp-pill lp-btn-accent" href="/import?example=1"><span>Try it with an example</span></Link>
            <Link className="lp-pill lp-btn-outline" href="/import"><span>Add your account</span></Link>
          </div>
        </div>
        <Link className="lp-hero-example" href="/import?example=1" aria-label="Example portfolio: open it">
          <div className="lp-hx-top"><span>Example</span><span>{board?.price_as_of ? `Close ${shortDate(board.price_as_of)}` : "Loading…"}</span></div>
          <div className="lp-hx-total">{board ? money(board.total) : "—"}</div>
          {EXAMPLE.map((h) => {
            const row = board?.rows.find((r) => r.symbol === h.symbol);
            const e = board?.exposure.find((x) => x.symbol === h.symbol);
            const spk = sparks[h.symbol];
            const down = spk && spk.length > 1 && spk[spk.length - 1].close < spk[0].close;
            return (
              <div className="lp-hx-row" key={h.symbol}>
                <span><b>{h.symbol}</b><small>{h.shares} shares</small></span>
                <span className={down ? "down" : "up"}>{spk ? <Spark closes={spk.map((p) => p.close)} /> : <span className="spark" />}</span>
                <span className="lp-hx-num">{row ? money(row.value) : "—"}
                  <small className={row?.change != null && row.change < 0 ? "down" : "up"}>{row?.change != null ? pct(row.change) : ""}</small></span>
                {e ? <StateBadge state={e.state} /> : <span />}
              </div>
            );
          })}
          <p className="lp-hx-note">Prices from Alpaca (IEX); badges from our tests on SEC and FRED data.</p>
        </Link>
      </section>

      <section className="lp-stats" aria-label="What's under the hood">
        <div className="lp-stat"><b>21,625</b><span>SEC filings read, plus 35,797 insider trades</span></div>
        <div className="lp-stat"><b>390k</b><span>reported financial figures from company filings</span></div>
        <div className="lp-stat"><b>103</b><span>stocks (the S&amp;P 100) plus SPY and QQQ</span></div>
        <div className="lp-stat"><b>2 years</b><span>of daily prices, and the 10-year Treasury from FRED</span></div>
      </section>

      <section className="lp-agent">
        <div>
          <h2 className="lp-agent-title">It doesn&rsquo;t predict.</h2>
          <h2 className="lp-agent-title">It checks.</h2>
        </div>
        <div className="lp-card-grid">
          <article className="lp-card">
            <h3 className="lp-card-title">Portfolio</h3>
            <p className="lp-card-text lp-t-body">Everything you own, with the one thing worth a look. One row per holding, each Calm, Heads up or Not tested.</p>
            <Link className="lp-pill lp-btn-accent" href="/portfolio"><span>Open your portfolio</span></Link>
            <DotsArt />
          </article>
          <article className="lp-card">
            <h3 className="lp-card-title">Signals</h3>
            <p className="lp-card-text lp-t-body">Every past time the news happened, and what the stock did next. Insider-selling cluster, rate jump against the market, or a 5% drop at the open.</p>
            <Link className="lp-pill lp-btn-accent" href="/signals?t=BX&s=rate_jump"><span>Does it matter?</span></Link>
            <RangeArt />
          </article>
        </div>
      </section>

      <section className="lp-feature">
        <ChartPanel />
        <div className="lp-feature-col">
          <h3 className="lp-t-h40 lp-feature-eyebrow">Stock pages</h3>
          <p className="lp-t-h40 lp-feature-title">Chart first, with a dot for every past event</p>
          <p className="lp-t-body lp-feature-text">1W to 2Y. Then what&rsquo;s going on, financials from SEC filings, and recent filings you can read in plain words.</p>
          <Link className="lp-pill lp-btn-accent" href="/company/BX"><span>Open BX</span></Link>
          <p className="lp-t-small lp-disclosure">Prices: Alpaca, two years daily. Plain-word filing summaries need a Gemini key.</p>
        </div>
      </section>

      <section className="lp-feature lp-feature-light">
        <FundsPanel />
        <div className="lp-feature-col">
          <Lockup word="Funds" />
          <p className="lp-t-h40 lp-feature-title">Look inside the fund, down to every company</p>
          <p className="lp-t-body lp-feature-text">SPY&rsquo;s top 10 and the rest of its 504 companies, the Heads up names inside it, 1M, 3M and 1Y returns, and this week&rsquo;s filings.</p>
          <Link className="lp-pill lp-btn-ink" href="/fund/SPY"><span>Open SPY</span></Link>
          <p className="lp-t-small lp-disclosure">SPY holdings from State Street. QQQ holdings not loaded yet.</p>
        </div>
      </section>

      <section className="lp-feature lp-feature-left">
        <PaperPanel />
        <div className="lp-feature-col">
          <Lockup word="Paper trading" />
          <p className="lp-t-h40 lp-feature-title">Try a trade with pretend money</p>
          <p className="lp-t-body lp-feature-text">Your holdings plus {money(PRACTICE_CASH)} in pretend cash. Buy and sell at Friday&rsquo;s close and get a receipt. A yellow &ldquo;Not real money&rdquo; bar stays on screen, and Reset starts you over. Nothing is ever sent.</p>
          <Link className="lp-pill lp-btn-accent" href="/paper"><span>Try paper trading</span></Link>
          <p className="lp-t-small lp-disclosure">Paper trading only. No orders are placed with any broker.</p>
        </div>
      </section>

      <section className="lp-protect">
        <h2 className="lp-t-h52 lp-protect-title">Honest about what isn&rsquo;t proven</h2>
        <div className="lp-protect-grid">
          <div className="lp-protect-item"><IconTested /><h5>309 pairs tested. 11 looked strong, about 6 by luck. None survive the correction.</h5></div>
          <div className="lp-protect-item"><IconHonest /><h5>When something isn&rsquo;t proven, it says so, on screen.</h5></div>
          <div className="lp-protect-item"><IconSources /><h5>Real SEC, Fed and price data. No sample data anywhere.</h5></div>
          <div className="lp-protect-item"><IconChecked /><h5>109 backend tests pass. 26 of 26 deliberate code breaks caught.</h5></div>
        </div>
      </section>

      <section className="lp-learn">
        <div className="lp-learn-inner">
          <h2 className="lp-t-h52 lp-learn-title">Lite for everyone. Pro shows the working.</h2>
          <p className="lp-t-body lp-learn-text">Tap the castle. Pro puts &ldquo;Why?&rdquo; next to every number: cases, normal rate, 90% range, both-halves check, correction result and sources.</p>
          <Link className="lp-pill lp-btn-white" href="/learn"><span>What the badges mean</span></Link>
          <div className="lp-learn-card" aria-hidden="true">
            <h4>The badges</h4>
            {[["Calm", "Nothing with a track record happened this week", "#2563eb"], ["Heads up", "Something happened that has mattered before", "#d4af37"], ["Not tested", "Not enough past cases to say either way", "#a0a0a0"]].map(([t, s, c]) => (
              <div className="lp-lrow" key={t}><div className="lp-lthumb" style={{ color: c }}>●</div><div><strong>{t}</strong><small>{s}</small></div><span>›</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-join-wrap">
        <div className="lp-join"><JoinLoop /></div>
        <div className="lp-join-inner">
          <h2 className="lp-t-serif lp-join-title">Understand what you own</h2>
          <Link className="lp-pill lp-btn-accent" href="/start"><span>Start in 3 taps</span></Link>
        </div>
      </section>
    </div>
  );
}
