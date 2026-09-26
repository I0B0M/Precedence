"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeKey, StateBadge } from "@/components/bits";
import { MarketCard } from "@/components/MarketCard";
import { ApiProblem, isNotFound, Loading, NotFollowed } from "@/components/Problem";
import { loadFund, type FundDetail } from "@/lib/fund";
import { money, pct, shortDate } from "@/lib/format";
import { FORM_WORDS, liteSummary } from "@/lib/words";

const SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };
/** "this week (Sep 19–25)" or "on Sep 25, 2026" when only one day is covered. */
function spanWords(span: FundDetail["filings_span"], fallback: string): string {
  if (!span) return fallback;
  if (span.start === span.end) return `on ${shortDate(span.end)}`;
  const a = new Date(span.start + "T12:00:00"), b = new Date(span.end + "T12:00:00");
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return `this week (${m(a)} ${a.getDate()}–${m(a) === m(b) ? "" : m(b) + " "}${b.getDate()})`;
}
const w = (x: number) => `${(x * 100).toFixed(x >= 0.1 ? 1 : 2)}%`;

// Brief: "understanding what they own". Blackstone coaching: investors think in funds: what's in it, how it's doing, what's next.
export default function FundScreen() {
  const { symbol: raw } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(raw).toUpperCase();
  const [f, setF] = useState<FundDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    loadFund(symbol).then(setF).catch(setError);
  }, [symbol]);

  if (error) return isNotFound(error) ? <NotFollowed ticker={symbol} /> : <ApiProblem />;
  if (!f) return <Loading what={symbol} />;

  const top = f.holdings.slice(0, 10);
  const max = Math.max(...top.map((h) => h.weight), 0.0001);
  const more = f.holdings_count - top.length;
  const unseen = Math.max(0, 1 - f.looked_through_share);
  const source = f.holdings_source ? SOURCES[f.holdings_source] ?? f.holdings_source : null;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <Link href="/" className="linkb">‹ Everything you own</Link>

      <header className="co-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="ticker">{f.symbol} · Fund</span>
          <div className="row-flex" style={{ gap: 14, alignItems: "center" }}>
            <h1>{f.name}</h1>
            <StateBadge state={f.fund_state} />
          </div>
        </div>
        {f.price && (
          <div className="co-price">
            <div className="bignum">{money(f.price.close, true)}</div>
            <p>
              <span className={f.price.change != null && f.price.change < 0 ? "down" : "up"}>{pct(f.price.change)}</span>
              <span className="mute"> · close {shortDate(f.price.day)}</span>
            </p>
          </div>
        )}
      </header>
      {f.fund_state === "WATCH" && <BadgeKey />}

      <div className="box">
        <h3>What&apos;s going on</h3>
        <p className="say-big">{f.fund_firing.length ? liteSummary(f.fund_firing) : "Nothing important today."}</p>
        <MarketCard where="self" onlyFor={f.symbol} />
      </div>

      {f.holdings.length === 0 ? (
        <div className="box">
          <h3>What&apos;s inside</h3>
          <p className="say-big">What&apos;s inside {f.symbol} isn&apos;t loaded yet.</p>
          <p className="mute">Stone shows this fund as one line until it has a holdings file for it. Nothing here is estimated.</p>
        </div>
      ) : (
        <div className="grid2">
          <div className="box">
            <h3>What&apos;s inside</h3>
            <div className="list">
              {top.map((h) => (
                <Link key={h.ticker} href={`/company/${h.ticker}`} className="list-row weight-row">
                  <span>
                    <b>{h.ticker}</b> <span className="mute">{h.name}</span>
                    <span className="wbar" aria-hidden><i style={{ width: `${(h.weight / max) * 100}%` }} /></span>
                  </span>
                  <span className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <span>{w(h.weight)}</span>
                    {h.state === "WATCH" && <StateBadge state="WATCH" />}
                  </span>
                </Link>
              ))}
            </div>
            <p className="note">
              {more > 0 ? `And ${more} more that Stone can see. ` : ""}
              {unseen > 0.005 ? `The other ${w(unseen)} of the fund is in companies Stone doesn't track yet. ` : ""}
              {f.holdings_as_of ? `Holdings as of ${shortDate(f.holdings_as_of)}${source ? `, ${source}` : ""}.` : ""}
            </p>
            {f.heads_up.length > 0 && (
              <p className="watchline">
                <b>Heads up inside:</b> {f.heads_up.map((h) => `${h.ticker} (${w(h.weight)})`).join(", ")}.
              </p>
            )}
          </div>

          <div className="stack" style={{ gap: 20 }}>
            <div className="box">
              <h3>How it&apos;s done</h3>
              <div className="versus perf" style={{ gap: 10 }}>
                {([["1 month", f.performance.d30], ["3 months", f.performance.d90], ["1 year", f.performance.y1]] as const).map(([label, v]) => (
                  <div key={label}>
                    <div className={`bignum ${v != null && v < 0 ? "down" : "up"}`} style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}>{v == null ? "—" : pct(v, true, 1)}</div>
                    <p className="note">{label}</p>
                  </div>
                ))}
              </div>
              <p className="note">Price change from daily closes{f.performance.as_of ? ` to ${shortDate(f.performance.as_of)}` : ""} (21, 63 and 252 trading days). Dividends not included.</p>
            </div>

            <div className="box">
              <h3>What happened inside {spanWords(f.filings_span, "this week")}</h3>
              {f.week_filings.length ? (
                <div className="list">
                  {f.week_filings.map((x) => (
                    <div key={`${x.ticker}-${x.accepted_at}-${x.form}`} className="list-row">
                      <span><b>{x.ticker}</b> {FORM_WORDS[x.form] ?? x.form}</span>
                      <span className="mute">
                        {shortDate(x.accepted_at)}{x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="mute">No SEC filings from its top 10 holdings in Stone&apos;s data {spanWords(f.filings_span, "this week")}.</p>}
              <p className="note">Filings from SEC EDGAR, for the fund&apos;s top 10 holdings.</p>
            </div>
          </div>
        </div>
      )}

      {f.holdings.length > 0 && (
        <div className="card pro-only">
          <h3>Top {f.holdings.length} holdings</h3>
          <div className="tscroll">
            <table>
              <thead><tr><th className="num">#</th><th>Holding</th><th className="num">Weight</th><th>State</th><th>Signals firing</th></tr></thead>
              <tbody>
                {f.holdings.map((h, i) => (
                  <tr key={h.ticker}>
                    <td className="num">{i + 1}</td>
                    <td><Link href={`/company/${h.ticker}`}><b>{h.ticker}</b></Link><div className="note">{h.name}</div></td>
                    <td className="num nowrap">{w(h.weight)}</td>
                    <td><StateBadge state={h.state} /></td>
                    <td>{h.firing.length ? h.firing.map((s) => `${s.pro} (${s.label})`).join("; ") : <span className="mute">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Weights from {source ?? "the fund's holdings file"}{f.holdings_as_of ? `, as of ${shortDate(f.holdings_as_of)}` : ""}; {w(f.looked_through_share)} of the fund
            is in companies Stone tracks. Holdings under 1% of the fund aren&apos;t tested, so they show &quot;Not tested&quot;.
            {f.built_from === "existing endpoints" && " Built from Stone's portfolio look-through until the fund endpoint ships."}
          </p>
        </div>
      )}
    </section>
  );
}
