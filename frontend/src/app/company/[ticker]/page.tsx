"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { BadgeKey, HoldoutNote, ScanLine, StateBadge, Verdict } from "@/components/bits";
import { FilingSummary } from "@/components/FilingSummary";
import { Why } from "@/components/Why";
import { MarketCard } from "@/components/MarketCard";
import { TodayMove } from "@/components/TodayMove";
import { ApiProblem, isNotFound, Loading, NotFollowed } from "@/components/Problem";
import { api, type CompanyDetail, type ExposureRow, type Scan } from "@/lib/api";
import { bigMoney, money, pct, sharePct, shortDate, timeET, whole } from "@/lib/format";
import { readHoldings, SAMPLE_PORTFOLIO } from "@/lib/holdings";
import { portfolioExtras } from "@/lib/other-assets";
import { SUMMARY_FORMS } from "@/lib/company";
import { headline } from "@/lib/words";
import { AfterNews, BigDays, RecentNews } from "./Moves";
import { StockChart } from "./StockChart";

// Brief: "understanding what they own" · "spread across different sources" · "summarize complex information"
export default function CompanyScreen() {
  const { ticker } = useParams<{ ticker: string }>();
  const [d, setD] = useState<CompanyDetail | null>(null);
  const [mine, setMine] = useState<ExposureRow | null>(null);
  const [portfolioTotal, setPortfolioTotal] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [scan, setScan] = useState<Scan | null>(null);

  useEffect(() => {
    api.scan().then(setScan).catch(() => {});
    api.company(ticker).then((body) => {
      setD(body);
      const holdings = readHoldings() ?? (body.company.source === "sample" ? SAMPLE_PORTFOLIO : []);
      if (holdings.length) {
        // With the home and 401(k) funds, so "share of everything you own" is out of everything, as on the board.
        api.portfolio(holdings, portfolioExtras()).then((p) => {
          setMine(p.exposure.find((e) => e.symbol === body.company.ticker) ?? null);
          setPortfolioTotal(p.subtotals?.total ?? p.total);
        }).catch(() => {});
      }
    }).catch(setError);
  }, [ticker]);

  if (error) return isNotFound(error) ? <NotFollowed ticker={decodeURIComponent(ticker).toUpperCase()} /> : <ApiProblem />;
  if (!d) return <Loading what={decodeURIComponent(ticker).toUpperCase()} />;

  const { company: co } = d;
  const main = headline(d.signals);
  const rateJump = d.signals.find((s) => s.signal === "rate_jump");
  const factsFrom = d.facts[0];
  // A fund's board row stands for only part of it (the rest shows as its stocks), so judge the whole fund from `direct`.
  const isFund = co.kind === "etf";
  const myShare = mine && portfolioTotal ? (isFund ? mine.direct : mine.total) / portfolioTotal : null;
  const myBadDay = mine ? (isFund ? (mine.bad_day_return != null ? mine.bad_day_return * mine.direct : null) : mine.bad_day_loss) : null;
  // The Lab tests single stocks; the market's own rate-jump result has no case page there.
  const inLab = (signal: string) => signal !== "market_rate_jump";
  const nextSignal = co.kind === "stock" ? ((main && inLab(main.signal) ? main : null) ?? d.signals.find((s) => inLab(s.signal) && s.label !== "NO DATA") ?? null) : null;
  const lastDay = d.prices[d.prices.length - 1]?.day ?? null;
  const filingUrl = (accession: string) => d.filings.find((f) => f.accession === accession)?.url ?? null;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <Link href="/portfolio" className="linkb">‹ Everything you own</Link>

      <StockChart
        ticker={co.ticker}
        name={co.name}
        kicker={`${co.ticker}${co.sector ? ` · ${co.sector}` : ""}${co.kind === "etf" ? " · fund" : ""}`}
        badge={d.state ? <StateBadge state={d.state} /> : null}
        prices={d.prices}
        sources={d.price_sources}
        signals={d.signals}
        initialSignal={main?.signal}
      />
      {co.legal_name && co.legal_name !== co.name && (
        <p className="note pro-only pro-add">SEC name: {co.legal_name}{co.cik ? ` · CIK ${co.cik}` : ""}</p>
      )}
      <TodayMove ticker={co.ticker} />
      {d.state === "WATCH" && <BadgeKey />}

      {/* ---------------- the top: biggest days, after news like this, recent news (Lite and Pro) ---------------- */}
      <BigDays days={d.days} ticker={co.ticker} />
      <AfterNews signals={d.signals} ticker={co.ticker} />
      {/* Pro shows the market card inside its signals table. */}
      {main?.signal === "rate_jump" && <div className="lite-only"><MarketCard /></div>}
      {isFund && <MarketCard onlyFor={co.ticker} />}
      {isFund && <Link className="linkb" href={`/fund/${co.ticker}`}>See what&apos;s inside {co.ticker} ›</Link>}
      <RecentNews d={d} />

      {/* ---------------- PRO ---------------- */}
      <div className="stack pro-only" style={{ gap: 20 }}>
        {d.signals.length > 0 && (
          <div className="card">
            <h3>Signals tested on {co.ticker}&apos;s own history</h3>
            <div className="tscroll sig-table">
              <table>
                <thead><tr><th>Signal</th><th className="num">Cases</th><th className="num">Came true</th><th className="num">Normal days</th><th className="num">90% range</th><th>Verdict</th><th>Hold-out</th><th>Now</th><th /></tr></thead>
                <tbody>
                  {d.signals.map((s) => (
                    <tr key={s.signal}>
                      <td>{s.pro}<div className="note">horizon {s.horizon} trading days</div></td>
                      <td className="num">{s.n}</td>
                      <td className="num">{s.n ? `${s.hits} (${whole(s.hit_rate)})` : "—"}<div className="note">{s.vs_market ? "worse than SPY" : "lower"}</div><Why signal={s} scan={scan} what={`${co.ticker} ${s.pro}`} source="SEC EDGAR · FRED DGS10 · Alpaca IEX daily prices" asOf={lastDay} /></td>
                      <td className="num">{whole(s.normal_rate)}<div className="note">of {s.normal_n} days</div></td>
                      <td className="num nowrap">{s.n ? `${whole(s.low)}–${whole(s.high)}` : "—"}</td>
                      <td><Verdict s={s} /></td>
                      <td><HoldoutNote s={s} /></td>
                      <td>{s.firing ? <b>firing</b> : <span className="mute">—</span>}</td>
                      <td className="nowrap">{inLab(s.signal) && <Link className="linkb" href={`/signals?t=${co.ticker}&s=${s.signal}`}>cases ›</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sig-cards">
              {d.signals.map((s) => (
                <div key={s.signal} className="sig-card">
                  <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
                    <b>{s.pro}</b>
                    <span><Verdict s={s} /></span>
                  </div>
                  <dl className="stats">
                    <div><dt>Cases</dt><dd>{s.n}</dd></div>
                    <div><dt>{s.vs_market ? "Worse than SPY" : "Lower after"}</dt><dd>{s.n ? `${s.hits} (${whole(s.hit_rate)})` : "—"}</dd></div>
                    <div><dt>Normal days</dt><dd>{whole(s.normal_rate)} <span className="note">of {s.normal_n}</span></dd></div>
                    <div><dt>90% range</dt><dd>{s.n ? `${whole(s.low)}–${whole(s.high)}` : "—"}</dd></div>
                  </dl>
                  <Why signal={s} scan={scan} what={`${co.ticker} ${s.pro}`} source="SEC EDGAR · FRED DGS10 · Alpaca IEX daily prices" asOf={lastDay} />
                  <p className="note">Horizon {s.horizon} trading days · {s.firing ? <b>firing now</b> : "not firing"}{s.holdout ? <> · hold-out <HoldoutNote s={s} /></> : null}</p>
                  {inLab(s.signal) && <Link className="linkb" href={`/signals?t=${co.ticker}&s=${s.signal}`}>See the cases ›</Link>}
                </div>
              ))}
            </div>
            <p className="note">STRONG only when the range&apos;s low end beats the normal-day rate. Fewer than 10 cases is always WEAK.
              Timed from SEC acceptance; measured from the next market open.</p>
            {rateJump && <MarketCard />}
            <ScanLine scan={scan} />
          </div>
        )}

      </div>

      {/* ---------------- everything else, collapsed ---------------- */}
      <details className="more-about">
        <summary>More about {co.ticker}: {mine ? "what it means for you, " : ""}figures and every filing</summary>
        <div className="stack" style={{ gap: 20, marginTop: 12 }}>
          <div className="box lite-only">
            <h3>What it means for you</h3>
            {mine ? (
              <dl className="kv">
                {mine.direct > 0 && <><dt>You own directly</dt><dd>{money(mine.direct)}</dd></>}
                {Object.values(mine.via_etf).some((v) => v > 0) && (
                  <><dt>Inside your funds</dt><dd>{money(Object.values(mine.via_etf).reduce((a, b) => a + b, 0))}</dd></>
                )}
                <dt>Share of everything you own</dt><dd>{sharePct(myShare)}</dd>
                <dt>A bad day could cost you</dt><dd className="down">{money(myBadDay)}</dd>
              </dl>
            ) : (
              <>
                <p className="mute">You don&apos;t own {co.ticker}.</p>
                <Link className="btn light small" href="/import" style={{ alignSelf: "flex-start" }}>Add account</Link>
              </>
            )}
            {mine && <p className="note">Bad day: the worst 1 in 20 days, past year.</p>}
          </div>
          <div className="stack pro-only" style={{ gap: 20 }}>
        {factsFrom && (
          <div className="card">
            <h3>XBRL facts</h3>
            <div className="tscroll">
              <table className="rtable">
                <thead><tr><th>Fact</th><th>Concept</th><th className="num">Value</th><th>Period</th><th>Form</th><th>Accession</th></tr></thead>
                <tbody>
                  {d.facts.map((f) => {
                    const url = filingUrl(f.accession);
                    return (
                      <tr key={f.key}>
                        <td data-label="Fact"><span>{f.pro}</span></td>
                        <td data-label="Concept" className="mute"><span>{f.concept}</span></td>
                        <td data-label="Value" className="num nowrap"><b>{bigMoney(f.value)}</b></td>
                        <td data-label="Period" className="nowrap"><span>{f.period_start ? `${f.period_start} → ` : "at "}{f.period_end}</span></td>
                        <td data-label="Form" className="nowrap"><span>{f.form}</span></td>
                        <td data-label="Accession" className="nowrap">{url ? <a href={url} target="_blank" rel="noopener noreferrer">{f.accession}</a> : <span>{f.accession}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">Values as filed, from SEC XBRL company facts.</p>
          </div>
        )}

        <div className="grid2 even">
          <div className="card">
            <h3>Filings</h3>
            <div className="tscroll">
              <table className="rtable">
                <thead><tr><th>Form · accession</th><th>Accepted (SEC)</th><th>Period</th></tr></thead>
                <tbody>
                  {d.filings.map((f) => (
                    <tr key={f.accession}>
                      <td data-label="Form" className="nowrap">
                        <span>
                          {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer"><b>{f.form}</b></a> : <b>{f.form}</b>}
                          <span className="note" style={{ display: "block" }}>{f.accession}</span>
                          {SUMMARY_FORMS.has(f.form) && <FilingSummary accession={f.accession} />}
                        </span>
                      </td>
                      <td data-label="Accepted (SEC)" className="nowrap"><span>{shortDate(f.accepted_at)}<span className="note" style={{ display: "block" }}>{timeET(f.accepted_at)}</span></span></td>
                      <td data-label="Period" className="nowrap"><span>{f.report_date ?? "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">Filings from SEC EDGAR, timed by SEC acceptance.</p>
          </div>
          <div className="stack" style={{ gap: 20 }}>
            {d.insider_sales.length > 0 && (
              <div className="card">
                <h3>Form 4 sales</h3>
                <table className="rtable">
                  <thead><tr><th>Accepted</th><th>Who</th><th className="num">Shares</th></tr></thead>
                  <tbody>
                    {d.insider_sales.slice(0, 8).map((s) => (
                      <tr key={`${s.accession}-${s.seq}`}>
                        <td data-label="Accepted" className="nowrap">{shortDate(s.accepted_at)}</td>
                        <td data-label="Who"><span className="clamp2" title={s.owner_name ?? undefined}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.owner_name}</a> : s.owner_name}</span><div className="note">{s.owner_title}</div></td>
                        <td data-label="Shares" className="num">{s.shares?.toLocaleString("en-US") ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {mine && (
              <div className="card">
                <h3>Your exposure</h3>
                <dl className="kv">
                  <dt>Direct</dt><dd>{money(mine.direct)}</dd>
                  {Object.entries(mine.via_etf).map(([etf, v]) => (<Fragment key={etf}><dt>Via {etf}</dt><dd>{money(v)}</dd></Fragment>))}
                  <dt>Share of portfolio</dt><dd>{pct(myShare, false)}</dd>
                  <dt>5th-percentile day (1y)</dt><dd className="down">{pct(mine.bad_day_return)} · {money(myBadDay)}</dd>
                </dl>
              </div>
            )}
            {d.rate && <p className="note">DGS10 {d.rate.value.toFixed(2)}% ({d.rate.day}, FRED)</p>}
          </div>
        </div>
          </div>
        </div>
      </details>

      {nextSignal && (
        <div className="next-step">
          <p>Has this mattered for {co.ticker} before?</p>
          <Link className="btn t-go" href={`/signals?t=${co.ticker}&s=${nextSignal.signal}`}>See the history</Link>
        </div>
      )}
      {!nextSignal && isFund && (
        <div className="next-step">
          <Link className="btn t-go" href={`/fund/${co.ticker}`}>What&apos;s inside {co.ticker}</Link>
        </div>
      )}
    </section>
  );
}
