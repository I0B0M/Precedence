"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeKey, StateBadge } from "@/components/bits";
import { MarketCard } from "@/components/MarketCard";
import { Why } from "@/components/Why";
import { api, type Scan } from "@/lib/api";
import { ApiProblem, isNotFound, Loading, NotFollowed } from "@/components/Problem";
import { loadFund, type FundView } from "@/lib/fund";
import { money, pct, shortDate } from "@/lib/format";
import { FORM_WORDS, liteSummary, SIGNAL_WORDS } from "@/lib/words";

const SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };
/** "this week (Sep 19–25)" or "on Sep 25, 2026" when only one day is covered. */
function spanWords(span: FundView["filings_span"], fallback: string): string {
  if (!span) return fallback;
  if (span.start === span.end) return `on ${shortDate(span.end)}`;
  const a = new Date(span.start + "T12:00:00"), b = new Date(span.end + "T12:00:00");
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return `this week (${m(a)} ${a.getDate()}–${m(a) === m(b) ? "" : m(b) + " "}${b.getDate()})`;
}
/** A holding row: a link when Precedence has a company page for it, plain otherwise. */
function WeightRow({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <Link href={href} className="list-row weight-row">{children}</Link> : <div className="list-row weight-row">{children}</div>;
}
const w = (x: number) => `${(x * 100).toFixed(x >= 0.1 ? 1 : 2)}%`;

// Brief: "understanding what they own". Blackstone coaching: investors think in funds: what's in it, how it's doing, what's next.
export default function FundScreen() {
  const { symbol: raw } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(raw).toUpperCase();
  const [f, setF] = useState<FundView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [scan, setScan] = useState<Scan | null>(null);

  useEffect(() => {
    loadFund(symbol).then(setF).catch(setError);
    api.scan().then(setScan).catch(() => {});
  }, [symbol]);

  if (error) return isNotFound(error) ? <NotFollowed ticker={symbol} /> : <ApiProblem />;
  if (!f) return <Loading what={symbol} />;

  // Group identical ticker + form + day ("LLY Insider trade ×3"); keep the first filing's link.
  const grouped = Object.values(f.week_filings.reduce<Record<string, { ticker: string; form: string; accepted_at: string; url: string | null; count: number }>>((acc, x) => {
    const k = `${x.ticker}|${x.form}|${x.accepted_at.slice(0, 10)}`;
    acc[k] = acc[k] ? { ...acc[k], count: acc[k].count + 1 } : { ...x, count: 1 };
    return acc;
  }, {}));
  const fundSignal = f.fund_firing.find((s) => s.label === "STRONG") ?? f.fund_firing[0] ?? null;
  const top = f.holdings.slice(0, 10);
  const max = Math.max(...top.map((h) => h.weight), 0.0001);
  const more = f.total_holdings_count - top.length;
  const unseen = Math.max(0, 1 - f.looked_through_share);
  const source = f.holdings_source ? SOURCES[f.holdings_source] ?? f.holdings_source : null;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <Link href="/portfolio" className="linkb">‹ Everything you own</Link>

      <header className="co-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="ticker">{f.symbol} · Fund</span>
          <div className="row-flex" style={{ gap: 14, alignItems: "center" }}>
            <h1>{f.name}</h1>
            <StateBadge state={f.fund_state} />
            {fundSignal && <Why signal={fundSignal} scan={scan} what={`${f.symbol} ${fundSignal.lite}`}
              source="FRED DGS10 rate data · our daily closes" asOf={f.price?.as_of} />}
          </div>
        </div>
        {f.price && (
          <div className="co-price">
            <div className="bignum">{money(f.price.last_close, true)}</div>
            <p>
              {f.price.change_1d != null && <span className={f.price.change_1d < 0 ? "down" : "up"}>{pct(f.price.change_1d)} · </span>}
              <span className="mute">close {shortDate(f.price.as_of)}</span>
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
          <p className="say-big">{f.note ?? `What's inside ${f.symbol} isn't loaded yet.`}</p>
          <p className="mute">Shown as one line until Precedence has its holdings file.</p>
        </div>
      ) : (
        <div className="grid2">
          <div className="box">
            <h3>What&apos;s inside</h3>
            <div className="list">
              {top.map((h) => (
                <WeightRow key={h.ticker} href={h.in_stone ? `/company/${h.ticker}` : null}>
                  <span>
                    <b>{h.ticker}</b> <span className="mute">{h.name ?? ""}</span>
                    <span className="wbar" aria-hidden><i style={{ width: `${(h.weight / max) * 100}%` }} /></span>
                  </span>
                  <span className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <span>{w(h.weight)}</span>
                    {h.state === "WATCH" && <StateBadge state="WATCH" />}
                  </span>
                </WeightRow>
              ))}
            </div>
            <p className="note">
              {more > 0 ? `And ${more} more${f.built_from === "api" ? "" : " that we can see"}. ` : ""}
              {f.holdings_as_of ? `As of ${shortDate(f.holdings_as_of)}${source ? `, ${source}` : ""}.` : ""}
              <span className="pro-only">{unseen > 0.005 ? ` The other ${w(unseen)} of the fund is in companies Precedence doesn't track yet.` : ""}</span>
            </p>
            {f.heads_up.length > 0 && (
              <p className="watchline"><b>Heads up inside:</b> {f.heads_up.map((h) => h.ticker).join(", ")}.</p>
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
                    <Why what={`${f.symbol} ${label} change`} rows={[["Change", v == null ? "Not enough history" : `${pct(v, true, 2)} over ${label}`], ["Basis", f.performance.basis]]}
                      source="our daily closes" asOf={f.performance.as_of} />
                  </div>
                ))}
              </div>
              <p className="note">
                Price only{f.performance.as_of ? `, to ${shortDate(f.performance.as_of)}` : ""}.
                <span className="pro-only"> Basis: {f.performance.basis}.</span>
              </p>
            </div>

            <div className="box">
              <h3>What happened inside {spanWords(f.filings_span, "this week")}</h3>
              {grouped.length ? (
                <div className="list">
                  {grouped.map((x) => (
                    <div key={`${x.ticker}-${x.accepted_at}-${x.form}`} className="list-row">
                      <span><b>{x.ticker}</b> {FORM_WORDS[x.form] ?? x.form}{x.count > 1 ? ` ×${x.count}` : ""}</span>
                      <span className="mute">
                        {shortDate(x.accepted_at)}{x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="mute">No filings from its top holdings {spanWords(f.filings_span, "this week")}.</p>}
              <p className="note pro-only">Filings from SEC EDGAR, for the fund&apos;s top holdings; same ticker, form and day grouped.</p>
            </div>
          </div>
        </div>
      )}

      {f.holdings.length > 0 && (
        <div className="card pro-only">
          <div className="row-flex" style={{ justifyContent: "space-between" }}>
            <h3>Top {f.holdings.length} holdings</h3>
            <Why what={`${f.symbol} holdings weights`}
              rows={[["Weights", "Each holding's share of the fund, from the fund's own holdings file"], ["Precedence tracks", `${w(f.looked_through_share)} of the fund`], ["Holdings", `${f.total_holdings_count}${f.built_from === "api" ? " in the fund" : " that we can see"}`]]}
              source={source ?? undefined} asOf={f.holdings_as_of} />
          </div>
          <div className="tscroll">
            <table>
              <thead><tr><th className="num">#</th><th>Holding</th><th className="num">Weight</th><th>State</th><th>Signals firing</th></tr></thead>
              <tbody>
                {f.holdings.map((h, i) => (
                  <tr key={h.ticker}>
                    <td className="num">{i + 1}</td>
                    <td>{h.in_stone ? <Link href={`/company/${h.ticker}`}><b>{h.ticker}</b></Link> : <b>{h.ticker}</b>}<div className="note">{h.name ?? "Not tracked by Precedence"}</div></td>
                    <td className="num nowrap">{w(h.weight)}</td>
                    <td><StateBadge state={h.state} /></td>
                    <td>{h.firing.length ? h.firing.map((s) => `${SIGNAL_WORDS[s.signal] ?? s.signal} (${s.label === "NO DATA" ? "not loaded" : s.label})`).join("; ") : <span className="mute">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Weights from {source ?? "the fund's holdings file"}{f.holdings_as_of ? `, as of ${shortDate(f.holdings_as_of)}` : ""}; {w(f.looked_through_share)} of the fund
            is in companies Precedence tracks. Holdings under 1% of the fund aren&apos;t tested, so they show &quot;Not tested&quot;.
            {f.built_from === "existing endpoints" && " Built from our portfolio look-through until the fund endpoint ships."}
          </p>
        </div>
      )}
    </section>
  );
}
