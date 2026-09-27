"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { ApiProblem, Loading } from "@/components/Problem";
import { Why } from "@/components/Why";
import { dateTimeET, money, pct } from "@/lib/format";
import { isPrivateFund, PRIVATE_LITE, privateFund, type PrivateFundPage } from "@/lib/private-funds";

const monthYear = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** The monthly values as one plain line, oldest to newest. No axes: the months and values are in the table under Pro. */
function NavLine({ points }: { points: { as_of: string; nav: number }[] }) {
  if (points.length < 2) return null;
  const w = 600, h = 120, pad = 6;
  const vs = points.map((p) => p.nav), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (w - 2 * pad), h - pad - ((p.nav - lo) / span) * (h - 2 * pad)]);
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" className={up ? "up" : "down"}
      aria-label={`Monthly value from ${monthYear(points[0].as_of)} to ${monthYear(points[points.length - 1].as_of)}: ${money(vs[0], true)} to ${money(vs[vs.length - 1], true)}`}>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="currentColor"><title>{monthYear(points[i].as_of)}: {money(points[i].nav, true)}</title></circle>)}
    </svg>
  );
}

// Brief: "understanding what they own". Blackstone's own investors hold non-traded funds with a monthly value, no daily price.
export function PrivateFundScreen({ symbol }: { symbol: string }) {
  const [f, setF] = useState<{ symbol: string; page: PrivateFundPage } | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    privateFund(symbol).then((page) => live && setF({ symbol, page })).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [symbol]);
  if (error) return <ApiProblem />;
  if (!f || f.symbol !== symbol) return <Loading what={symbol} />;
  const p = f.page;
  const lite = isPrivateFund(symbol) ? PRIVATE_LITE[symbol.toUpperCase() as keyof typeof PRIVATE_LITE] : "Priced monthly.";
  const rets = [["1 month", p.returns.m1], ["3 months", p.returns.m3], ["12 months", p.returns.m12]] as const;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <Link href="/funds" className="linkb">‹ Funds</Link>

      <header className="co-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="ticker">{p.symbol} · {p.sponsor} fund</span>
          <div className="row-flex" style={{ gap: 14, alignItems: "center" }}>
            <h1>{p.name}</h1>
            <StateBadge state={null} />
          </div>
          <p className="note">Priced monthly, not daily.</p>
        </div>
        {p.nav && (
          <div className="co-price">
            <div className="bignum">{money(p.nav.value, true)}</div>
            <p className="mute">
              Value per share, {monthYear(p.nav.as_of)}
              <Why what={`${p.symbol} monthly value`} source={p.source} asOf={p.nav.as_of}
                rows={[["Share class", `Class ${p.nav.share_class}`], ["From", `${p.nav.form} filing ${p.nav.accession}`], ["Basis", p.returns.basis]]} />
            </p>
          </div>
        )}
      </header>

      <div className="box">
        <h3>What&apos;s going on</h3>
        <p className="say-big">{lite}</p>
        <div className="versus perf" style={{ gap: 10 }}>
          {rets.map(([label, v]) => (
            <div key={label}>
              <div className={`bignum ${v != null && v < 0 ? "down" : "up"}`} style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}>{v == null ? "—" : pct(v, true, 1)}</div>
              <p className="note">{label}</p>
              <Why what={`${p.symbol} ${label} change`} rows={[["Change", v == null ? "That month's value isn't filed" : `${pct(v, true, 2)} over ${label}`], ["Basis", p.returns.basis]]}
                source={p.source} asOf={p.nav?.as_of ?? null} />
            </div>
          ))}
        </div>
        <NavLine points={p.history} />
        <p className="note">Monthly value{p.history.length ? `, ${monthYear(p.history[0].as_of)} to ${monthYear(p.history[p.history.length - 1].as_of)}` : ""}.</p>
      </div>

      <div className="stack pro-only pro-add" style={{ gap: 16 }}>
        {p.invests_in && (
          <p><b>What it invests in:</b> &ldquo;{p.invests_in.text}&rdquo; <a href={p.invests_in.url} target="_blank" rel="noopener noreferrer">sec.gov</a></p>
        )}
        {p.liquidity_note && (
          <p><b>Getting money out:</b> {p.liquidity_note}{p.liquidity_url && <> <a href={p.liquidity_url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}</p>
        )}
        <p className="note">Basis: {p.returns.basis}. Source: {p.source}. No signals are tested on a monthly-priced fund, so it shows &quot;Not tested&quot;.</p>

        {p.filings.length > 0 && (
          <div className="list">
            <p className="list-head">Latest filings (SEC acceptance time)</p>
            {p.filings.map((x) => (
              <div key={x.accepted_at + x.form} className="list-row">
                <span>{x.form}</span>
                <span className="mute">{dateTimeET(x.accepted_at)}{x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}</span>
              </div>
            ))}
          </div>
        )}

        {p.history.length > 0 && (
          <div className="tscroll">
            <table className="rtable">
              <thead><tr><th>Month</th><th className="num">Value per share</th><th>Filing</th></tr></thead>
              <tbody>
                {[...p.history].reverse().map((h) => (
                  <tr key={h.as_of}>
                    <td data-label="Month"><span>{monthYear(h.as_of)}</span></td>
                    <td data-label="Value per share" className="num"><b>{money(h.nav, true)}</b></td>
                    <td data-label="Filing"><a href={h.url} target="_blank" rel="noopener noreferrer">sec.gov</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
