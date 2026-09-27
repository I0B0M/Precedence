"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { ApiProblem, Loading } from "@/components/Problem";
import { Why } from "@/components/Why";
import { dateTimeET, money, pct, shortDate } from "@/lib/format";
import { isPrivateFund, navMoney, PRIVATE_LIQUIDITY, PRIVATE_LITE, PRIVATE_RETURN_NOTE, PRIVATE_WITHDRAW, privateFund, shortQuote, type PrivateFundKey, type PrivateFundPage } from "@/lib/private-funds";
import { useOtherAssets } from "@/lib/other-assets";

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
      aria-label={`Monthly value from ${monthYear(points[0].as_of)} to ${monthYear(points[points.length - 1].as_of)}: ${navMoney(vs[0])} to ${navMoney(vs[vs.length - 1])}`}>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="currentColor"><title>{monthYear(points[i].as_of)}: {navMoney(points[i].nav)}</title></circle>)}
    </svg>
  );
}

// Brief: "understanding what they own". Blackstone's own investors hold non-traded funds with a monthly value, no daily price.
export function PrivateFundScreen({ symbol }: { symbol: string }) {
  const [f, setF] = useState<{ symbol: string; page: PrivateFundPage } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const mine = useOtherAssets().privateFunds.filter((x) => x.fund === symbol.toUpperCase());
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
  // Total return (value change plus distributions paid) from the same filings. Null for a window with any missing filing.
  const tr = p.total_return ?? null;
  const trs = tr ? ([["1 month", tr.m1], ["3 months", tr.m3], ["12 months", tr.m12]] as const) : null;
  const sign = (v: number | null) => (v != null && v < 0 ? "down" : "up");

  return (
    <section className="stack" style={{ gap: 28 }}>
      <Link href="/portfolio" className="linkb">‹ Everything you own</Link>

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
            {/* Lite rounds to cents; Pro shows the filing's own precision ($14.685). */}
            <div className="bignum price"><span className="lite-only">{money(p.nav.value, true)}</span><span className="pro-only">{navMoney(p.nav.value)}</span></div>
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
        {tr?.m12 != null ? (
          <p className="lite-only">Total return over 12 months: <b className={sign(tr.m12)}>{pct(tr.m12, true, 1)}</b>. Includes the income it paid out.</p>
        ) : <p className="lite-only">{PRIVATE_RETURN_NOTE}</p>}
        {isPrivateFund(symbol) && <p className="lite-only">{PRIVATE_WITHDRAW[symbol.toUpperCase() as PrivateFundKey]}</p>}
        {/* Pro: total return is the main figure when filed; the value-only change sits under it, never called a return. */}
        {trs && tr && <>
          <p className="pro-only pro-add list-head" style={{ marginBottom: 0 }}>Total return (distributions paid, not reinvested)</p>
          <div className="versus perf pro-only pro-add" style={{ gap: 10 }}>
            {trs.map(([label, v]) => (
              <div key={label}>
                <div className={`bignum ${sign(v)}`} style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}>{v == null ? "—" : pct(v, true, 1)}</div>
                <p className="note">{label}</p>
                <Why what={`${p.symbol} ${label} total return`} rows={[["Total return", v == null ? "A month in this window has no filing, so it isn't worked out" : `${pct(v, true, 2)} over ${label}`], ["Basis", tr.basis], ["Worked out", "(end value per share + distributions with a record date in the window) ÷ start value − 1"]]}
                  source={p.source} asOf={p.nav?.as_of ?? null} />
              </div>
            ))}
          </div>
        </>}
        <p className={`pro-only pro-add ${trs ? "note" : "list-head"}`} style={{ marginBottom: 0 }}>Change in value per share (distributions not included){trs
          ? `: ${rets.map(([l, v]) => `${v == null ? "—" : pct(v, true, 1)} ${l}`).join(" · ")}` : ""}</p>
        {!trs && <div className="versus perf pro-only pro-add" style={{ gap: 10 }}>
          {rets.map(([label, v]) => (
            <div key={label}>
              <div className={`bignum ${v != null && v < 0 ? "down" : "up"}`} style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}>{v == null ? "—" : pct(v, true, 1)}</div>
              <p className="note">{label}</p>
              <Why what={`${p.symbol} ${label} change`} rows={[["Change in value per share", v == null ? "That month's value isn't filed" : `${pct(v, true, 2)} over ${label}`], ["Basis", p.returns.basis], ["Not included", "distributions paid out, so this isn't the investor's return"]]}
                source={p.source} asOf={p.nav?.as_of ?? null} />
            </div>
          ))}
        </div>}
        <NavLine points={p.history} />
        <p className="note">Monthly value{p.history.length ? `, ${monthYear(p.history[0].as_of)} to ${monthYear(p.history[p.history.length - 1].as_of)}` : ""}.</p>
      </div>

      {mine.length > 0 && (() => {
        const amount = mine.reduce((a, x) => a + x.amount, 0);
        const shares = p.nav ? amount / p.nav.value : null;
        return (
          <div className="box">
            <h3>What it means for you</h3>
            <dl className="kv">
              <dt>What you entered</dt><dd>{money(amount)}</dd>
              {shares != null && <><dt>About</dt><dd>{shares.toLocaleString("en-US", { maximumFractionDigits: 0 })} shares
                <Why what={`${p.symbol} shares`} rows={[["Worked out", `${money(amount)} ÷ ${navMoney(p.nav!.value)} (Class ${p.nav!.share_class}, ${monthYear(p.nav!.as_of)})`]]} source={p.source} /></dd></>}
            </dl>
            <p className="note">The value you entered is what counts in your total.</p>
          </div>
        );
      })()}

      <div className="stack pro-only pro-add" style={{ gap: 16 }}>
        {p.invests_in && (
          <p><b>What it invests in:</b>{" "}
            {shortQuote(p.invests_in.text) ? <>&ldquo;{p.invests_in.text}&rdquo; </> : null}
            <a href={p.invests_in.url} target="_blank" rel="noopener noreferrer">{shortQuote(p.invests_in.text) ? "sec.gov" : "Read it on sec.gov"}</a></p>
        )}
        {(p.liquidity_note || p.liquidity_url) && isPrivateFund(p.symbol) && (
          <p><b>Getting money out:</b> {PRIVATE_LIQUIDITY[p.symbol.toUpperCase() as PrivateFundKey]}
            {p.liquidity_url && <> <a href={p.liquidity_url} target="_blank" rel="noopener noreferrer">Read the terms on sec.gov</a></>}</p>
        )}
        <p className="note">{tr ? <>Total return basis: {tr.basis}. Value per share change basis: {p.returns.basis}.</> : <>Basis: {p.returns.basis}.</>} Source: {p.source}. No signals are tested on a monthly-priced fund, so it shows &quot;Not tested&quot;.</p>

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

        {(p.distributions?.length ?? 0) > 0 && (
          <div className="tscroll">
            <table className="rtable">
              <thead><tr><th>Month</th><th className="num">Paid per share</th><th>Record date</th><th>Filing</th></tr></thead>
              <tbody>
                {[...(p.distributions ?? [])].reverse().map((x) => (
                  <tr key={x.record_date}>
                    <td data-label="Month"><span>{monthYear(x.month)}{p.nav && x.record_date > p.nav.as_of
                      ? <span className="note" style={{ display: "block" }}>after the latest value, so not in any return yet</span> : null}</span></td>
                    <td data-label="Paid per share" className="num"><b>{navMoney(x.amount)}</b></td>
                    <td data-label="Record date"><span>{shortDate(x.record_date)}</span></td>
                    <td data-label="Filing"><a href={x.url} target="_blank" rel="noopener noreferrer">sec.gov</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    <td data-label="Value per share" className="num"><b>{navMoney(h.nav)}</b></td>
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
