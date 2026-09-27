"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { BadgeKey, HoldoutNote, ScanLine, StateBadge, Verdict } from "@/components/bits";
import { FilingSummary } from "@/components/FilingSummary";
import { Why } from "@/components/Why";
import { MarketCard } from "@/components/MarketCard";
import { TodayMove } from "@/components/TodayMove";
import { Compare } from "@/components/Compare";
import { ApiProblem, isNotFound, Loading, NotFollowed } from "@/components/Problem";
import { api, type CompanyDetail, type ExposureRow, type Scan } from "@/lib/api";
import { bigMoney, money, pct, sharePct, shortDate, timeET, whole } from "@/lib/format";
import { readHoldings, SAMPLE_PORTFOLIO } from "@/lib/holdings";
import { portfolioExtras } from "@/lib/other-assets";
import { FORM_WORDS, headline, personName } from "@/lib/words";
import { StockChart } from "./StockChart";

// Filings that get a plain-words summary (Gemini, figures checked against XBRL).
const SUMMARY_FORMS = new Set(["8-K", "10-Q", "10-K"]);

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
  const others = d.signals.filter((s) => s !== main);
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

      {/* ---------------- LITE ---------------- */}
      <div className="grid2 lite-only">
        <div className="box">
          <h3>What&apos;s going on</h3>
          {main ? (
            <>
              <p className="say-big"><b>{main.lite}.</b></p>
              {/* Two rows on the same count, after the news and in normal times, then one plain answer. No legend. */}
              <Compare s={main} ticker={co.ticker} />
              {main.firing && (() => {
                // What to check next: the evidence behind the Heads up, never advice. Insider selling: the latest Form 4.
                // Its Form 4 on sec.gov (insider_sales[].url); every past case is the link under it.
                // Today's evidence first: the most recent Form 4 sale (who, their title, when), then every past case.
                const s0 = [...d.insider_sales].sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))[0] as (typeof d.insider_sales)[number] | undefined;
                const f4 = main.signal === "insider_cluster" && s0 ? s0.url ?? filingUrl(s0.accession) : null;
                return (
                  <>
                    {main.signal === "insider_cluster" && s0 && (() => {
                      // One Form 4 can have several sale lines: add them up. The date is the trade, not the filing.
                      const lines = d.insider_sales.filter((x) => x.accession === s0.accession);
                      const shares = lines.reduce((a, x) => a + (x.shares ?? 0), 0);
                      const md = (iso: string) => shortDate(iso).replace(/, \d{4}$/, "");
                      // The trade date, and when it was reported if that's a different day (the date the rest of the page uses).
                      const traded = s0.transaction_date ? md(s0.transaction_date) : null, reported = md(s0.accepted_at);
                      const when = traded && traded !== reported ? `${traded} (reported ${reported})` : reported;
                      return (
                        <p className="note">Latest sale: {personName(s0.owner_name) ?? "An insider"}{s0.owner_title ? `, ${s0.owner_title},` : ""} sold{" "}
                          {shares > 0 ? `${shares.toLocaleString("en-US")} shares` : "shares"} on {when}.
                          {f4 && <> <a href={f4} target="_blank" rel="noopener noreferrer">sec.gov ›</a></>}</p>
                      );
                    })()}
                    {inLab(main.signal) && <Link className="linkb" href={`/signals?t=${co.ticker}&s=${main.signal}`}>See each past time this happened ›</Link>}
                  </>
                );
              })()}
              {main.signal === "rate_jump" && <MarketCard />}
            </>
          ) : (
            <>
              <p className="say-big">{co.kind === "etf" ? "A fund: many stocks in one." : "Nothing unusual right now."}</p>
              {isFund && <MarketCard onlyFor={co.ticker} />}
              {isFund && <Link className="linkb" href={`/fund/${co.ticker}`}>See what&apos;s inside {co.ticker} ›</Link>}
            </>
          )}
          {others.length > 0 && (
            <div className="list">
              <p className="list-head">Also checked</p>
              {others.map((s) => (
                inLab(s.signal) ? (
                  <Link key={s.signal} className="list-row" href={`/signals?t=${co.ticker}&s=${s.signal}`}>
                    <span>{s.lite}</span>
                    <span className="mute">{s.label === "NO DATA" ? "Not loaded yet" : s.firing ? "Happening now" : "Not now"} ›</span>
                  </Link>
                ) : (
                  <div key={s.signal} className="list-row">
                    <span>{s.lite}</span>
                    <span className="mute">{s.label === "NO DATA" ? "Not loaded yet" : s.firing ? "Happening now" : "Not now"}</span>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <div className="box">
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

          <div className="box">
            <h3>What&apos;s new</h3>
            <div className="list">
              {d.insider_sales[0] && (
                <div className="list-row"><span>Insiders sold shares</span><span className="mute">{shortDate(d.insider_sales[0].accepted_at)}
                  {d.insider_sales[0].url && <> · <a href={d.insider_sales[0].url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}</span></div>
              )}
              {d.filings.slice(0, 3).map((f) => (
                <div key={f.accession} className="list-row"><span>{FORM_WORDS[f.form] ?? f.form}{SUMMARY_FORMS.has(f.form) && <FilingSummary accession={f.accession} />}</span><span className="mute">{shortDate(f.accepted_at)}</span></div>
              ))}
              {d.rate && (
                <div className="list-row"><span>10-year Treasury rate {d.rate.value.toFixed(2)}%</span><span className="mute">{shortDate(d.rate.day)}</span></div>
              )}
            </div>
          </div>
        </div>
      </div>

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
                <table>
                  <thead><tr><th>Accepted</th><th>Who</th><th className="num">Shares</th></tr></thead>
                  <tbody>
                    {d.insider_sales.slice(0, 8).map((s) => (
                      <tr key={`${s.accession}-${s.seq}`}>
                        <td className="nowrap">{shortDate(s.accepted_at)}</td>
                        <td><span className="clamp2" title={s.owner_name ?? undefined}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.owner_name}</a> : s.owner_name}</span><div className="note">{s.owner_title}</div></td>
                        <td className="num">{s.shares?.toLocaleString("en-US") ?? "—"}</td>
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
