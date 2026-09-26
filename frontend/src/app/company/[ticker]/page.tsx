"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { HitDots, LabelTag, StateBadge } from "@/components/bits";
import { PriceChart, type Pin } from "@/components/PriceChart";
import { api, type CompanyDetail, type ExposureRow } from "@/lib/api";
import { bigMoney, dateTimeET, money, pct, shortDate, whole } from "@/lib/format";
import { readHoldings, SAMPLE_PORTFOLIO } from "@/lib/holdings";
import { FORM_WORDS, headline, liteHistory, liteVerdict } from "@/lib/words";

// Brief: "understanding what they own" · "spread across different sources" · "summarize complex information"
export default function CompanyScreen() {
  const { ticker } = useParams<{ ticker: string }>();
  const [d, setD] = useState<CompanyDetail | null>(null);
  const [mine, setMine] = useState<ExposureRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.company(ticker).then((body) => {
      setD(body);
      const holdings = readHoldings() ?? (body.company.source === "sample" ? SAMPLE_PORTFOLIO : []);
      if (holdings.length) {
        api.portfolio(holdings).then((p) => setMine(p.exposure.find((e) => e.symbol === body.company.ticker) ?? null));
      }
    }).catch((e) => setError(e.message));
  }, [ticker]);

  const pins = useMemo<Pin[]>(() => {
    if (!d) return [];
    const fromFilings = d.filings.filter((f) => ["10-K", "10-Q", "8-K"].includes(f.form)).slice(0, 6)
      .map((f) => ({ day: f.accepted_at.slice(0, 10), label: `${shortDate(f.accepted_at)} · ${FORM_WORDS[f.form] ?? f.form}` }));
    const fromSignals = d.signals.filter((s) => s.firing)
      .map((s) => ({ day: s.firing!.known_at.slice(0, 10), label: `${shortDate(s.firing!.known_at)} · ${s.lite} (firing)` }));
    return [...fromFilings, ...fromSignals].sort((a, b) => a.day.localeCompare(b.day));
  }, [d]);

  if (error) return <div className="badline">{error}</div>;
  if (!d) return <p className="mute">Loading {ticker.toUpperCase()}…</p>;

  const { company: co, last } = d;
  const main = headline(d.signals);
  const others = d.signals.filter((s) => s !== main);

  return (
    <section className="stack" style={{ gap: 20 }}>
      <Link href="/" className="linkb">← Everything you own</Link>

      <div className="pf-head" style={{ margin: 0 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="ticker">{co.ticker}</span>
          <h1>{co.name}</h1>
          <p className="mute">{co.sector}{co.kind === "etf" ? " · fund" : ""}</p>
        </div>
        <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
          {d.state && <StateBadge state={d.state} />}
          {last && (
            <>
              <div className="bignum" style={{ fontSize: 40 }}>{money(last.close, true)}</div>
              <span className={last.change != null && last.change < 0 ? "down" : "up"}>
                {pct(last.change)} <span className="mute">· close {shortDate(last.day)}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ---------------- LITE ---------------- */}
      <div className="grid2 lite-only">
        <div className="box">
          <h3>What&apos;s going on</h3>
          {main ? (
            <>
              <p><b>{main.lite}.</b> {liteHistory(main, co.ticker)}</p>
              <HitDots cases={main.cases ?? []} />
              <p className="note">{liteVerdict(main)}</p>
            </>
          ) : (
            <p>{co.kind === "etf" ? "Funds hold many stocks; open a stock to see its signals." : "Nothing unusual is happening. No need to do anything."}</p>
          )}
          <PriceChart prices={d.prices} />
          {others.length > 0 && (
            <p className="note">
              Also checked: {others.map((s) => `${s.lite.toLowerCase()} (${s.firing ? "happening now" : "not now"})`).join(" · ")}.
            </p>
          )}
        </div>

        <div className="stack">
          <div className="box">
            <h3>What it means for you</h3>
            {mine ? (
              <dl className="kv">
                <dt>You own directly</dt><dd>{money(mine.direct)}</dd>
                <dt>Inside your funds</dt><dd>{money(Object.values(mine.via_etf).reduce((a, b) => a + b, 0))}</dd>
                <dt>Share of everything you own</dt><dd>{whole(mine.share_of_total)}</dd>
                <dt>A bad day could cost you</dt><dd className="down">{money(mine.bad_day_loss)}</dd>
              </dl>
            ) : <p className="mute">You don&apos;t own this one.</p>}
            <p className="note">&quot;A bad day&quot; is this stock&apos;s 1-in-20 worst day of the past year.</p>
          </div>

          {d.facts.length > 0 && (
            <div className="box">
              <h3>The numbers</h3>
              <dl className="kv">
                {d.facts.map((f) => (<Fragment key={f.key}><dt>{f.lite}</dt><dd>{bigMoney(f.value)}</dd></Fragment>))}
              </dl>
              <p className="note">From the company&apos;s own filings with the SEC, period ending {shortDate(d.facts[0].period_end)}.</p>
            </div>
          )}

          <div className="box">
            <h3>What&apos;s new</h3>
            <ul className="stack" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
              {d.insider_sales[0] && (
                <li>Insiders sold shares, most recently {shortDate(d.insider_sales[0].accepted_at)}.</li>
              )}
              {d.filings.slice(0, 3).map((f) => (
                <li key={f.accession}>{FORM_WORDS[f.form] ?? f.form}, {shortDate(f.accepted_at)}</li>
              ))}
              {d.rate && <li>Interest rates (10-year Treasury): {d.rate.value.toFixed(2)}% on {shortDate(d.rate.day)}</li>}
            </ul>
          </div>
        </div>
      </div>

      {/* ---------------- PRO ---------------- */}
      <div className="stack pro-only" style={{ gap: 20 }}>
        <div className="card">
          <h3>Price, 2 years, with filings and live signals</h3>
          <PriceChart prices={d.prices} pins={pins} />
        </div>

        {d.signals.length > 0 && (
          <div className="card">
            <h3>Signals tested on {co.ticker}&apos;s own history</h3>
            <div className="tscroll">
              <table>
                <thead><tr><th>Signal</th><th className="num">Cases</th><th className="num">Lower after</th><th className="num">Normal days</th><th className="num">90% range</th><th>Verdict</th><th>Now</th><th /></tr></thead>
                <tbody>
                  {d.signals.map((s) => (
                    <tr key={s.signal}>
                      <td>{s.pro}<div className="note">horizon {s.horizon} trading days</div></td>
                      <td className="num">{s.n}</td>
                      <td className="num">{s.n ? `${s.hits} (${whole(s.hit_rate)})` : "—"}</td>
                      <td className="num">{whole(s.normal_rate)}<div className="note">of {s.normal_n} days</div></td>
                      <td className="num">{s.n ? `${whole(s.low)}–${whole(s.high)}` : "—"}</td>
                      <td><LabelTag label={s.label} /></td>
                      <td>{s.firing ? <b>firing</b> : <span className="mute">—</span>}</td>
                      <td><Link className="linkb" href={`/lab?t=${co.ticker}&s=${s.signal}`}>cases</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">STRONG only when the range&apos;s low end beats the normal-day rate. Fewer than 10 cases is always WEAK.
              Timed from SEC acceptance; measured from the next market open.</p>
          </div>
        )}

        <div className="grid2">
          <div className="card">
            <h3>Filings</h3>
            <div className="tscroll">
              <table>
                <thead><tr><th>Form</th><th>Accepted (SEC)</th><th>Period</th><th>Accession</th></tr></thead>
                <tbody>
                  {d.filings.map((f) => (
                    <tr key={f.accession}>
                      <td>{f.form}</td>
                      <td>{dateTimeET(f.accepted_at)}</td>
                      <td>{f.report_date ?? "—"}</td>
                      <td>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.accession}</a> : <span className="mute">{f.accession}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="stack">
            {d.facts.length > 0 && (
              <div className="card">
                <h3>XBRL facts</h3>
                <table>
                  <tbody>
                    {d.facts.map((f) => (
                      <tr key={f.key}>
                        <td>{f.pro}<div className="note">{f.concept}</div></td>
                        <td className="num">{bigMoney(f.value)}<div className="note">{f.period_start ? `${f.period_start} → ` : "at "}{f.period_end} · {f.form}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {d.insider_sales.length > 0 && (
              <div className="card">
                <h3>Form 4 sales</h3>
                <table>
                  <thead><tr><th>Accepted</th><th>Who</th><th className="num">Shares</th></tr></thead>
                  <tbody>
                    {d.insider_sales.slice(0, 8).map((s) => (
                      <tr key={s.accession + s.accepted_at}>
                        <td>{dateTimeET(s.accepted_at)}</td>
                        <td>{s.owner_name}<div className="note">{s.owner_title}</div></td>
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
                  <dt>Share of portfolio</dt><dd>{pct(mine.share_of_total, false)}</dd>
                  <dt>5th-percentile day (1y)</dt><dd className="down">{pct(mine.bad_day_return)} · {money(mine.bad_day_loss)}</dd>
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
