"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./landing.css";
import { StateBadge } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { ChartPanel, DotsArt, FundsPanel, IconChecked, IconHonest, IconSources, IconTested, Mark, PaperPanel, RangeArt } from "@/components/landing/Art";
import { HeroLoop, JoinLoop } from "@/components/landing/Loops";
import { api, type CompanyDetail, type FundPage, type PortfolioOut, type Status, type Today } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { PRACTICE_CASH } from "@/lib/practice";

// The example the landing shows, and the one /import?example=1 fills in.
const EXAMPLE = [{ symbol: "BX", shares: 10 }, { symbol: "AMZN", shares: 5 }, { symbol: "SPY", shares: 3 }];
// Not served by the API yet (no all-time totals endpoint): from the database load, Sept 2026.
const INSIDER_TRADES = 35797;

const Lockup = ({ word }: { word: string }) => (
  <div className="lp-lockup"><Mark /><b>Precedence</b> <i>{word}</i></div>
);
const day = (iso: string | null | undefined) => (iso ? shortDate(iso).replace(/, \d{4}$/, "") : "…");

// Brief: "more accessible … engaging" · "understanding what they own"
export default function Landing() {
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});
  const [today, setToday] = useState<Today | null>(null);
  const [spy, setSpy] = useState<FundPage | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    api.portfolio(EXAMPLE).then(setBoard).catch(() => {});
    Promise.all(EXAMPLE.map((h) => api.company(h.symbol).then((d) => [h.symbol, d.prices.slice(-30)] as const).catch(() => null)))
      .then((p) => setSparks(Object.fromEntries(p.filter((x) => x !== null))));
    api.today().then(setToday).catch(() => {});
    api.fund("SPY").then(setSpy).catch(() => {});
    api.status().then(setStatus).catch(() => {});
  }, []);

  const rate = today?.market.rate;
  const stocks = status?.companies_by_source.sec;

  return (
    <div className="lp">
      <section className="lp-hero-wrap">
        <div className="lp-hero"><HeroLoop /><div className="lp-scrim" /></div>
        <div className="lp-hero-col">
          <Lockup word="for everyday investors" />
          <h1 className="lp-hero-title">See what&rsquo;s happening to what you own</h1>
          <p className="lp-hero-text">And whether that kind of news has ever mattered for that stock. It doesn&rsquo;t predict. <Link className="lp-u" href="/learn">How we check</Link></p>
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
        <div className="lp-stat"><b>{INSIDER_TRADES.toLocaleString("en-US")}</b><span>insider trades read from SEC Form 4s</span></div>
        <div className="lp-stat"><b>{spy ? spy.total_holdings_count : "…"}</b><span>companies inside SPY, as of {day(spy?.holdings_as_of)}</span></div>
        <div className="lp-stat"><b>{rate ? `${rate.value.toFixed(2)}%` : "…"}</b><span>10-year Treasury (FRED), {day(rate?.day)}</span></div>
        <div className="lp-stat"><b>{stocks ?? "…"}</b><span>stocks tested, priced at the {day(board?.price_as_of)} close</span></div>
      </section>

      <section className="lp-agent">
        <div>
          <h2 className="lp-agent-title">It doesn&rsquo;t predict.</h2>
          <h2 className="lp-agent-title">It checks.</h2>
        </div>
        <div className="lp-card-grid">
          <article className="lp-card">
            <h3 className="lp-card-title">Portfolio</h3>
            <p className="lp-card-text lp-t-body">Everything you own, with the one thing worth a look.</p>
            <Link className="lp-pill lp-btn-accent" href="/portfolio"><span>Open your portfolio</span></Link>
            <DotsArt />
          </article>
          <article className="lp-card">
            <h3 className="lp-card-title">Signals</h3>
            <p className="lp-card-text lp-t-body">Every past time the news happened, and what followed.</p>
            <Link className="lp-pill lp-btn-accent" href="/signals?t=BX&s=rate_jump"><span>Signals</span></Link>
            <RangeArt />
          </article>
        </div>
      </section>

      <section className="lp-feature">
        <ChartPanel />
        <div className="lp-feature-col">
          <h3 className="lp-t-h40 lp-feature-eyebrow">Stock pages</h3>
          <p className="lp-t-h40 lp-feature-title">Chart first, with a dot for every past event</p>
          <p className="lp-t-body lp-feature-text">Financials and filings from the SEC, in plain words.</p>
          <Link className="lp-pill lp-btn-accent" href="/company/BX"><span>Open BX</span></Link>
        </div>
      </section>

      <section className="lp-feature lp-feature-light">
        <FundsPanel />
        <div className="lp-feature-col">
          <Lockup word="Funds" />
          <p className="lp-t-h40 lp-feature-title">Look inside the fund, down to every company</p>
          <p className="lp-t-body lp-feature-text">All {spy ? spy.total_holdings_count : "…"} SPY companies, with the Heads up names flagged.</p>
          <Link className="lp-pill lp-btn-ink" href="/fund/SPY"><span>Open SPY</span></Link>
        </div>
      </section>

      <section className="lp-feature lp-feature-left">
        <PaperPanel />
        <div className="lp-feature-col">
          <Lockup word="Paper trading" />
          <p className="lp-t-h40 lp-feature-title">Try a trade with pretend money</p>
          <p className="lp-t-body lp-feature-text">{money(PRACTICE_CASH)} of pretend cash at Friday&rsquo;s close. Nothing is sent.</p>
          <Link className="lp-pill lp-btn-accent" href="/paper"><span>Try paper trading</span></Link>
        </div>
      </section>

      <section className="lp-protect">
        <h2 className="lp-t-h52 lp-protect-title">Honest about what isn&rsquo;t proven</h2>
        <div className="lp-protect-grid">
          <div className="lp-protect-item"><IconTested /><h5>309 pairs tested. None survive the correction.</h5></div>
          <div className="lp-protect-item"><IconHonest /><h5>When something isn&rsquo;t proven, it says so.</h5></div>
          <div className="lp-protect-item"><IconSources /><h5>Real SEC, Fed and price data. No samples.</h5></div>
          <div className="lp-protect-item"><IconChecked /><h5>109 backend tests pass. 26 of 26 breaks caught.</h5></div>
        </div>
      </section>

      <section className="lp-learn">
        <div className="lp-learn-inner">
          <h2 className="lp-t-h52 lp-learn-title">Lite for everyone. Pro shows the working.</h2>
          <p className="lp-t-body lp-learn-text">Tap the castle to see the cases behind every number.</p>
          <Link className="lp-pill lp-btn-white" href="/learn"><span>What the badges mean</span></Link>
          <div className="lp-learn-card" aria-hidden="true">
            <h4>The badges</h4>
            {[["Calm", "Nothing with a track record happened", "#2563eb"], ["Heads up", "Something that has mattered before happened", "#d4af37"], ["Not tested", "Not enough past cases to say", "#a0a0a0"]].map(([t, s, c]) => (
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
