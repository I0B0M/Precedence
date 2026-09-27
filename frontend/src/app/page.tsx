"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./home.css";
import { StateBadge } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { ChartPanel, DotsArt, FundsPanel, IconChecked, IconHonest, IconSources, IconTested, Mark, PaperPanel, RangeArt } from "@/components/landing/Art";
import { HeroLoop } from "@/components/landing/Loops";
import { api, type CompanyDetail, type FundPage, type PortfolioOut, type Scan, type Status, type Today } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { PRACTICE_CASH } from "@/lib/practice";
import { useHoldings } from "@/lib/holdings";
import { TodayFunnel } from "@/components/Today";

// The example the home page shows, and the one /import?example=1 fills in.
const EXAMPLE = [{ symbol: "BX", shares: 10 }, { symbol: "AMZN", shares: 5 }, { symbol: "SPY", shares: 3 }];
// Not served by the API yet (no all-time totals endpoint): counted in the database load, as of Sep 25.
const INSIDER_TRADES = 35797;
const BADGES: [string, string, string][] = [
  ["Calm", "Nothing with a track record is happening.", "var(--blue)"],
  ["Heads up", "Has come before drops. Not a prediction.", "var(--gold)"],
  ["Not tested", "We haven’t tested this one.", "var(--text-2)"],
];

const day = (iso: string | null | undefined) => (iso ? shortDate(iso).replace(/, \d{4}$/, "") : "…");

/** One band of the home page, full width. The two surfaces alternate by position (home.css), so an optional band
 *  (your week) never puts two of the same colour together. */
function Band({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} className="home-band" aria-label={label}>
      <div className="home-inner">{children}</div>
    </section>
  );
}

// Brief: "more accessible … engaging" · "understanding what they own". Sections follow the product: what you own, does
// it matter, Lite vs Pro, practice, where the data comes from.
export default function Home() {
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});
  const [today, setToday] = useState<Today | null>(null);
  const [spy, setSpy] = useState<FundPage | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [mine] = useHoldings(null); // your saved holdings: their week comes first when you come back

  useEffect(() => {
    api.portfolio(EXAMPLE).then(setBoard).catch(() => {});
    Promise.all(EXAMPLE.map((h) => api.company(h.symbol).then((d) => [h.symbol, d.prices.slice(-30)] as const).catch(() => null)))
      .then((p) => setSparks(Object.fromEntries(p.filter((x) => x !== null))));
    api.today().then(setToday).catch(() => {});
    api.fund("SPY").then(setSpy).catch(() => {});
    api.status().then(setStatus).catch(() => {});
    api.scan().then(setScan).catch(() => {});
  }, []);

  const rate = today?.market.rate;
  const stocks = status?.companies_by_source.sec;

  return (
    <div className="home">
      {/* ---- hero + the example portfolio ---- */}
      <section className="home-band home-hero" aria-label="Precedence">
        <div className="home-hero-bg" aria-hidden><HeroLoop /></div>
        <div className="home-inner home-hero-grid">
          <div className="stack" style={{ gap: 20 }}>
            <p className="home-lockup"><Mark /><b>Precedence</b> <span>for everyday investors</span></p>
            <h1>See what&rsquo;s happening to what you own</h1>
            <p className="lede">
              And whether that kind of news has ever mattered for that stock. It doesn&rsquo;t predict.{" "}
              <Link className="home-link" href="/learn">How we check</Link>
            </p>
            <div className="home-ctas">
              <Link className="btn" href="/import?example=1">Try it with an example</Link>
              <Link className="btn light" href="/import">Add your account</Link>
            </div>
          </div>
          <Link className="card home-example" href="/import?example=1" aria-label="Example portfolio: open it">
            <span className="home-example-top"><span className="kicker">Example</span>
              <span className="note">{board?.price_as_of ? `Close ${shortDate(board.price_as_of)}` : "Loading…"}</span></span>
            <span className="bignum home-example-total">{board ? money(board.total) : "—"}</span>
            {EXAMPLE.map((h) => {
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
        </div>
      </section>

      {/* ---- coming back: this week for what you own ---- */}
      {mine && mine.length > 0 && (
        <Band id="your-week" label="This week for what you own">
          <div className="home-head">
            <span className="kicker">Your week</span>
            <h2>What happened to what you own</h2>
          </div>
          <TodayFunnel symbols={mine.map((h) => h.symbol)} alsoLite />
          <Link className="btn" href="/portfolio">Open your portfolio</Link>
        </Band>
      )}

      {/* ---- what you own: portfolio and funds ---- */}
      <Band id="what-you-own" label="What you own">
        <div className="home-head">
          <span className="kicker">What you own</span>
          <h2>Stocks, funds, a 401(k) and a home, in one place</h2>
        </div>
        <div className="home-cards">
          <article className="card home-card">
            <h3>Portfolio</h3>
            <p className="mute">Everything you own, with the one thing worth a look.</p>
            <Link className="btn" href="/portfolio">Open your portfolio</Link>
            <DotsArt />
          </article>
          <article className="card home-card">
            <h3>Funds</h3>
            <p className="mute">Look inside the fund, down to every company. All {spy ? spy.total_holdings_count : "…"} SPY companies, with the Heads up names flagged.</p>
            <Link className="btn" href="/funds">See the funds</Link>
            <FundsPanel />
          </article>
        </div>
      </Band>

      {/* ---- does it matter: signals, stock pages, honesty ---- */}
      <Band id="does-it-matter" label="Does it matter">
        <div className="home-head">
          <span className="kicker">Does it matter?</span>
          <h2>It doesn&rsquo;t predict. It checks.</h2>
        </div>
        <div className="home-cards">
          <article className="card home-card">
            <h3>Signals</h3>
            <p className="mute">Every past time the news happened, and what followed.</p>
            <Link className="btn" href="/signals?t=BX&s=rate_jump">Signals</Link>
            <RangeArt />
          </article>
          <article className="card home-card">
            <h3>Stock pages</h3>
            <p className="mute">Chart first, with a dot for every past event. Financials and filings from the SEC, in plain words.</p>
            <Link className="btn" href="/company/BX">Open BX</Link>
            <ChartPanel />
          </article>
        </div>
        <div className="home-head" style={{ marginTop: 16 }}>
          <h3>Honest about what isn&rsquo;t proven</h3>
        </div>
        <ul className="home-facts">
          <li><IconTested /><span>{scan ? `${scan.tested} pairs tested. ${scan.strong} looked strong, about ${Math.round(scan.expected_by_chance)} by luck.` : "…"}</span></li>
          <li><IconChecked /><span>{scan?.strong_fdr10 != null ? `${scan.strong_fdr10} survive the correction, as of ${day(scan.as_of)}.` : "…"}</span></li>
          <li><IconHonest /><span>When something isn&rsquo;t proven, it says so.</span></li>
        </ul>
      </Band>

      {/* ---- Lite vs Pro ---- */}
      <Band id="lite-pro" label="Lite and Pro">
        <div className="home-split">
          <div className="home-head">
            <span className="kicker">Lite and Pro</span>
            <h2>Lite for everyone. Pro shows the working.</h2>
            <p className="lede">Switch at the top of any page. Pro adds the evidence, the sources and the raw rows under the same answer.</p>
            <Link className="btn light" href="/learn">What the badges mean</Link>
          </div>
          <div className="card home-badges" aria-label="The badges">
            {BADGES.map(([t, s, c]) => (
              <div className="home-badge-row" key={t}>
                <i style={{ background: c }} aria-hidden />
                <span><b>{t}</b><small className="note">{s}</small></span>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* ---- paper trading ---- */}
      <Band id="paper-trading" label="Paper trading">
        <div className="home-split">
          <div className="home-head">
            <span className="kicker">Paper trading</span>
            <h2>Try a trade with pretend money</h2>
            <p className="lede">{money(PRACTICE_CASH)} of pretend cash, under a yellow &ldquo;Not real money&rdquo; bar.</p>
            <Link className="btn" href="/paper">Try paper trading</Link>
          </div>
          <div className="card home-card"><PaperPanel /></div>
        </div>
      </Band>

      {/* ---- where the data comes from ---- */}
      <Band id="sources" label="Where the data comes from">
        <div className="home-head">
          <span className="kicker">Where the data comes from</span>
          <h2><span className="home-inline-icon"><IconSources /></span>Real SEC, Fed and price data. No samples.</h2>
        </div>
        <dl className="home-stats">
          <div><dt>{INSIDER_TRADES.toLocaleString("en-US")}</dt><dd>insider trades read from SEC Form 4s, as of Sep 25</dd></div>
          <div><dt>{spy ? spy.total_holdings_count : "…"}</dt><dd>companies inside SPY, as of {day(spy?.holdings_as_of)}</dd></div>
          <div><dt>{rate ? `${rate.value.toFixed(2)}%` : "…"}</dt><dd>10-year Treasury rate<span className="pro-only"> (FRED)</span>, {day(rate?.day)}</dd></div>
          <div><dt>{stocks ?? "…"}</dt><dd>stocks tested, priced at the {day(board?.price_as_of)} close</dd></div>
        </dl>
        <div className="home-close">
          <h2>Understand what you own</h2>
          <Link className="btn" href="/start">Start in 3 taps</Link>
        </div>
      </Band>
    </div>
  );
}
