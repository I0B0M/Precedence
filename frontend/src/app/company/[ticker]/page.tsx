"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { BadgeKey, HitDots, HoldoutNote, LabelTag, ScanLine, StateBadge } from "@/components/bits";
import { FilingSummary } from "@/components/FilingSummary";
import { MarketCard } from "@/components/MarketCard";
import { ApiProblem, isNotFound, Loading, NotFollowed } from "@/components/Problem";
import { api, type CompanyDetail, type ExposureRow, type Scan } from "@/lib/api";
import { bigMoney, money, pct, shortDate, timeET, whole } from "@/lib/format";
import { readHoldings, SAMPLE_PORTFOLIO } from "@/lib/holdings";
import { FORM_WORDS, headline, liteHistory, liteVerdict } from "@/lib/words";
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
        api.portfolio(holdings).then((p) => {
          setMine(p.exposure.find((e) => e.symbol === body.company.ticker) ?? null);
          setPortfolioTotal(p.total);
        });
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
  const myShare = mine ? (isFund ? (portfolioTotal ? mine.direct / portfolioTotal : null) : mine.share_of_total) : null;
  const myBadDay = mine ? (isFund ? (mine.bad_day_return != null ? mine.bad_day_return * mine.direct : null) : mine.bad_day_loss) : null;
  // The Lab tests single stocks; the market's own rate-jump result has no case page there.
  const inLab = (signal: string) => signal !== "market_rate_jump";
  const filingUrl = (accession: string) => d.filings.find((f) => f.accession === accession)?.url ?? null;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <Link href="/" className="linkb">‹ Everything you own</Link>

      <StockChart
        ticker={co.ticker}
        name={co.name}
        kicker={`${co.ticker}${co.sector ? ` · ${co.sector}` : ""}${co.kind === "etf" ? " · fund" : ""}`}
        badge={d.state ? <StateBadge state={d.state} /> : null}
        prices={d.prices}
        signals={d.signals}
        initialSignal={main?.signal}
      />
      {d.state === "WATCH" && <BadgeKey />}

      {/* ---------------- LITE ---------------- */}
      <div className="grid2 lite-only">
        <div className="box">
          <h3>What&apos;s going on</h3>
          {main ? (
            <>
              <p className="say-big"><b>{main.lite}.</b> {liteHistory(main, co.ticker)}</p>
              <HitDots cases={main.cases ?? []} vsMarket={main.vs_market} />
              <p><b>{liteVerdict(main)}</b></p>
              {main.signal === "rate_jump" && <MarketCard where="above" />}
            </>
          ) : (
            <>
              <p className="say-big">{co.kind === "etf" ? "Funds hold many stocks; open a stock to see its signals." : "Nothing unusual is happening. No need to do anything."}</p>
              {isFund && <MarketCard where="self" onlyFor={co.ticker} />}
              {isFund && <Link className="linkb" href={`/fund/${co.ticker}`}>See what&apos;s inside {co.ticker} ›</Link>}
            </>
          )}
          {others.length > 0 && (
            <div className="list">
              <p className="list-head">Also checked</p>
              {others.map((s) => (
                inLab(s.signal) ? (
                  <Link key={s.signal} className="list-row" href={`/lab?t=${co.ticker}&s=${s.signal}`}>
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
                <dt>You own directly</dt><dd>{money(mine.direct)}</dd>
                {Object.values(mine.via_etf).some((v) => v > 0) && (
                  <><dt>Inside your funds</dt><dd>{money(Object.values(mine.via_etf).reduce((a, b) => a + b, 0))}</dd></>
                )}
                <dt>Share of everything you own</dt><dd>{whole(myShare)}</dd>
                <dt>A bad day could cost you</dt><dd className="down">{money(myBadDay)}</dd>
              </dl>
            ) : (
              <>
                <p className="mute">You don&apos;t own {co.ticker}. Bring in what you own and this shows it in dollars.</p>
                <Link className="btn light small" href="/import" style={{ alignSelf: "flex-start" }}>Add an account</Link>
              </>
            )}
            {mine && <p className="note">&quot;A bad day&quot; is this {isFund ? "fund" : "stock"}&apos;s 1-in-20 worst day of the past year.</p>}
          </div>

          {factsFrom && (
            <div className="box">
              <h3>The numbers</h3>
              <dl className="kv">
                {d.facts.map((f) => (<Fragment key={f.key}><dt>{f.lite}</dt><dd>{bigMoney(f.value)}</dd></Fragment>))}
              </dl>
              <p className="note">From {co.name}&apos;s own {factsFrom.form} filed with the SEC, period ending {shortDate(factsFrom.period_end)}.</p>
            </div>
          )}

          <div className="box">
            <h3>What&apos;s new</h3>
            <div className="list">
              {d.insider_sales[0] && (
                <div className="list-row"><span>Insiders sold shares</span><span className="mute">{shortDate(d.insider_sales[0].accepted_at)}</span></div>
              )}
              {d.filings.slice(0, 3).map((f) => (
                <div key={f.accession} className="list-row"><span>{FORM_WORDS[f.form] ?? f.form}{SUMMARY_FORMS.has(f.form) && <FilingSummary accession={f.accession} />}</span><span className="mute">{shortDate(f.accepted_at)}</span></div>
              ))}
              {d.rate && (
                <div className="list-row"><span>10-year Treasury rate {d.rate.value.toFixed(2)}%</span><span className="mute">{shortDate(d.rate.day)}</span></div>
              )}
            </div>
            <p className="note">Filings from SEC EDGAR; interest rate from FRED.</p>
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
                      <td className="num">{s.n ? `${s.hits} (${whole(s.hit_rate)})` : "—"}<div className="note">{s.vs_market ? "worse than SPY" : "lower"}</div></td>
                      <td className="num">{whole(s.normal_rate)}<div className="note">of {s.normal_n} days</div></td>
                      <td className="num nowrap">{s.n ? `${whole(s.low)}–${whole(s.high)}` : "—"}</td>
                      <td><LabelTag label={s.label} /></td>
                      <td><HoldoutNote s={s} /></td>
                      <td>{s.firing ? <b>firing</b> : <span className="mute">—</span>}</td>
                      <td className="nowrap">{inLab(s.signal) && <Link className="linkb" href={`/lab?t=${co.ticker}&s=${s.signal}`}>cases ›</Link>}</td>
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
                    <LabelTag label={s.label} />
                  </div>
                  <dl className="stats">
                    <div><dt>Cases</dt><dd>{s.n}</dd></div>
                    <div><dt>{s.vs_market ? "Worse than SPY" : "Lower after"}</dt><dd>{s.n ? `${s.hits} (${whole(s.hit_rate)})` : "—"}</dd></div>
                    <div><dt>Normal days</dt><dd>{whole(s.normal_rate)} <span className="note">of {s.normal_n}</span></dd></div>
                    <div><dt>90% range</dt><dd>{s.n ? `${whole(s.low)}–${whole(s.high)}` : "—"}</dd></div>
                  </dl>
                  <p className="note">Horizon {s.horizon} trading days · {s.firing ? <b>firing now</b> : "not firing"}{s.holdout ? <> · hold-out <HoldoutNote s={s} /></> : null}</p>
                  {inLab(s.signal) && <Link className="linkb" href={`/lab?t=${co.ticker}&s=${s.signal}`}>See the cases ›</Link>}
                </div>
              ))}
            </div>
            <p className="note">STRONG only when the range&apos;s low end beats the normal-day rate. Fewer than 10 cases is always WEAK.
              Timed from SEC acceptance; measured from the next market open.</p>
            {rateJump && <MarketCard where="above" />}
            <ScanLine scan={scan} />
          </div>
        )}

        {factsFrom && (
          <div className="card">
            <h3>XBRL facts</h3>
            <div className="tscroll">
              <table>
                <thead><tr><th>Fact</th><th>Concept</th><th className="num">Value</th><th>Period</th><th>Form</th><th>Accession</th></tr></thead>
                <tbody>
                  {d.facts.map((f) => {
                    const url = filingUrl(f.accession);
                    return (
                      <tr key={f.key}>
                        <td>{f.pro}</td>
                        <td className="mute">{f.concept}</td>
                        <td className="num nowrap"><b>{bigMoney(f.value)}</b></td>
                        <td className="nowrap">{f.period_start ? `${f.period_start} → ` : "at "}{f.period_end}</td>
                        <td className="nowrap">{f.form}</td>
                        <td className="nowrap">{url ? <a href={url} target="_blank" rel="noopener noreferrer">{f.accession}</a> : f.accession}</td>
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
              <table>
                <thead><tr><th>Form · accession</th><th>Accepted (SEC)</th><th>Period</th></tr></thead>
                <tbody>
                  {d.filings.map((f) => (
                    <tr key={f.accession}>
                      <td className="nowrap">
                        {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer"><b>{f.form}</b></a> : <b>{f.form}</b>}
                        <div className="note">{f.accession}</div>
                        {SUMMARY_FORMS.has(f.form) && <FilingSummary accession={f.accession} />}
                      </td>
                      <td className="nowrap">{shortDate(f.accepted_at)}<div className="note">{timeET(f.accepted_at)}</div></td>
                      <td className="nowrap">{f.report_date ?? "—"}</td>
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
                        <td><span className="clamp2" title={s.owner_name ?? undefined}>{s.owner_name}</span><div className="note">{s.owner_title}</div></td>
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
    </section>
  );
}
