"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HitDots, HoldoutNote, LabelTag, StrictNote } from "@/components/bits";
import { MarketCard } from "@/components/MarketCard";
import { ApiProblem, Loading } from "@/components/Problem";
import { api, type CompanyRow, type SignalResult } from "@/lib/api";
import { horizonWords, pct, shortDate, whole } from "@/lib/format";
import { hitWords, isBorderline, liteHistory, liteVerdict } from "@/lib/words";

type Spec = { key: string; lite: string; pro: string; horizon: number };

// Shortcuts only; each is shown only if the API lists it.
const QUICK = ["BX", "AMZN", "AAPL", "NVDA", "JPM"];
const DEFAULT = { t: "BX", s: "rate_jump" };

// Brief: "discover trends and risks" · "turn information into meaningful insight" · "engaging"
export default function SignalLab() {
  const [stocks, setStocks] = useState<CompanyRow[]>([]);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [ticker, setTicker] = useState<string | null>(null);
  const [signal, setSignal] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; r: SignalResult } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    Promise.all([api.companies(), api.labSignals()]).then(([cos, sp]) => {
      const st = cos.filter((c) => c.kind === "stock");
      setStocks(st);
      setSpecs(sp);
      // A link can name a stock or signal the Lab doesn't have. Say so; never swap in a different one silently.
      const t = q.get("t"), s = q.get("s");
      const tOk = !!t && st.some((c) => c.ticker === t), sOk = !!s && sp.some((x) => x.key === s);
      setUnavailable([
        ...(t && !tOk ? [`${t} isn't available in the Lab, which tests single stocks we have data for.`] : []),
        ...(s && !sOk ? [`"${s}" isn't a signal the Lab can test.`] : []),
      ]);
      // With no link params, open on the demo story (BX + rate jump) when the API has both.
      setTicker(t ? (tOk ? t : null) : st.find((c) => c.ticker === DEFAULT.t)?.ticker ?? st[0]?.ticker ?? null);
      setSignal(s ? (sOk ? s : null) : sp.find((x) => x.key === DEFAULT.s)?.key ?? sp[0]?.key ?? null);
    }).catch(setError);
  }, []);

  useEffect(() => {
    if (!ticker || !signal) return;
    // A slower answer for an earlier pick must not land after this one, or the page waits forever for a key it replaced.
    let live = true;
    api.lab(ticker, signal).then((r) => {
      if (live) setResult({ key: `${ticker}|${signal}`, r });
    }).catch((e) => {
      if (live) setError(e);
    });
    try {
      window.history.replaceState(null, "", `/lab?t=${ticker}&s=${signal}`);
    } catch {}
    return () => {
      live = false;
    };
  }, [ticker, signal]);

  if (error) return <ApiProblem />;
  if (!stocks.length || !specs.length) return <Loading what="the Lab" />;
  const quick = QUICK.filter((t) => stocks.some((c) => c.ticker === t));
  const key = `${ticker}|${signal}`;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="ticker">Does it matter?</span>
        <h1>Has this ever mattered?</h1>
        <p className="lede">
          <span className="lite-only">Pick a stock and a kind of news. We check every time it happened in the last two years and what the stock did next.</span>
          <span className="pro-only">Two years per stock. Entry at the next open after the event was public; hit = lower after the horizon.
            A rate jump hits every stock on the same days, so there hit = did worse than SPY over the same days.
            Compared with the same stock&apos;s normal days, measured the same way; 90% Wilson range.</span>
        </p>
      </div>

      <div className="grid2 lab-pick">
        <div className="stack" style={{ gap: 10 }}>
          <label className="list-head" htmlFor="lab-stock">Stock</label>
          <select id="lab-stock" className="select" value={ticker ?? ""} onChange={(e) => setTicker(e.target.value)}>
            {!ticker && <option value="" disabled>Pick a stock</option>}
            {stocks.map((c) => <option key={c.ticker} value={c.ticker}>{c.ticker} · {c.name}</option>)}
          </select>
          {quick.length > 0 && (
            <div className="quick" role="group" aria-label="Quick picks">
              {quick.map((t) => (
                <button key={t} type="button" aria-pressed={ticker === t} onClick={() => setTicker(t)}>{t}</button>
              ))}
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <span className="list-head" id="lab-signal">Kind of news</span>
          <div className="choices" role="radiogroup" aria-labelledby="lab-signal">
            {specs.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={signal === s.key} onClick={() => setSignal(s.key)}>
                <span>
                  <b className="lite-only">{s.lite}</b><b className="pro-only">{s.pro}</b>
                  <span className="note" style={{ display: "block" }}>then {horizonWords(s.horizon)}</span>
                </span>
                <span className="check" aria-hidden>{signal === s.key ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {signal === "rate_jump" && (
        <div className="card">
          <h3>First, the whole market</h3>
          <MarketCard where="below" />
        </div>
      )}

      {!ticker || !signal ? (
        unavailable.length > 0 && (
          <div className="card">
            <h3>Not available</h3>
            {unavailable.map((u) => <p key={u}>{u}</p>)}
            <p className="mute">Pick {!ticker ? "a stock" : ""}{!ticker && !signal ? " and " : ""}{!signal ? "a kind of news" : ""} above to run a test.</p>
          </div>
        )
      ) : result?.key !== key ? <Loading what={`${ticker} and that news`} /> : <LabResult key={key} r={result.r} ticker={ticker} />}
    </section>
  );
}

const STAGGER = 60; // ms between dots; matches .hitdots in globals.css

/** Counts from 0 to `to` over `ms`, ease-out. Shows the final number at once under reduced motion. */
function CountUp({ to, ms }: { to: number; ms: number }) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || ms <= 0) {
      raf.current = requestAnimationFrame(() => setV(to));
      return () => cancelAnimationFrame(raf.current);
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - f, 3))));
      if (f < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, ms]);
  return <>{v}%</>;
}

function LabResult({ r, ticker }: { r: SignalResult; ticker: string }) {
  const cases = r.cases ?? [];
  const span = horizonWords(r.horizon).replace("a ", "");
  // The reveal: dots fill one by one (and the hit rate counts with them), then normal and the range fade in,
  // then the verdict strip. t1/t2 are CSS delays so reduced motion simply shows everything.
  const fill = cases.length * STAGGER + 320;
  const timing = { "--t1": `${fill}ms`, "--t2": `${fill + 300}ms` } as React.CSSProperties;
  const tone = r.label === "STRONG" ? "strong" : r.label === "NO DATA" ? "nodata" : "weak";
  return (
    <div className="card lab-result" style={timing}>
      <h2>{ticker}: <span className="lite-only">{r.lite.toLowerCase()}</span><span className="pro-only">{r.pro}</span></h2>

      <HitDots cases={cases} vsMarket={r.vs_market} />

      {r.n > 0 && (
        <div className="versus">
          <div>
            <div className="bignum" aria-label={whole(r.hit_rate)}>{r.hit_rate == null ? "—" : <CountUp to={Math.round(r.hit_rate * 100)} ms={fill} />}</div>
            <p className="note">{r.hits} of {r.n} times, it {hitWords(r)}</p>
          </div>
          <div className="lab-after">
            <div className="bignum mute">{whole(r.normal_rate)}</div>
            <p className="note">in a normal {span}: {r.normal_hits} of {r.normal_n}</p>
          </div>
        </div>
      )}


      {r.n > 0 && (
        <div className="stack lab-after" style={{ gap: 4 }}>
          <span className="note">
            <span className="lite-only">The dark bar is where the real rate likely is. The blue line is a normal {span}.
              Stone says it has mattered before only when the whole bar is right of the line.</span>
            <span className="pro-only">90% Wilson interval for P({r.vs_market ? "worse than SPY" : "lower"} after {r.horizon}d) vs normal-day rate ({r.normal_hits}/{r.normal_n}).</span>
          </span>
          <div className="rangebar" role="img" aria-label={`Range ${whole(r.low)} to ${whole(r.high)}, normal ${whole(r.normal_rate)}`}>
            <div className="track" />
            <div className="span" style={{ left: `${(r.low ?? 0) * 100}%`, width: `${((r.high ?? 0) - (r.low ?? 0)) * 100}%` }} />
            {r.normal_rate != null && (
              <div className="normal" style={{ left: `${r.normal_rate * 100}%` }}><span>normal {whole(r.normal_rate)}</span></div>
            )}
          </div>
        </div>
      )}

      <div className={`verdict ${tone}`} role="status">
        <LabelTag label={r.label} borderline={isBorderline(r)} />
        <p><b>{liteVerdict(r)}</b> <span className="lite-only">{liteHistory(r, ticker)}</span></p>
      </div>

      {r.holdout && (
        <p className="pro-only note">Split-half hold-out: <HoldoutNote s={r} /></p>
      )}
      <StrictNote s={r} />

      {r.firing && (
        <p className={r.label === "STRONG" ? "watchline" : "okline"}>
          <b>Happening now:</b> {r.firing.note}.{" "}
          {r.label === "STRONG"
            ? <><span className="lite-only">This is why Stone gives it a Heads up.</span><span className="pro-only">This is why the stock is on WATCH.</span></>
            : <><span className="lite-only">Not proven for this stock, so this news alone doesn&apos;t give it a Heads up.</span>
              <span className="pro-only">Not proven for this stock, so this signal alone doesn&apos;t put it on WATCH.</span></>}
        </p>
      )}

      <div className="pro-only">
        <div className="case-list">
          {cases.map((c) => (
            <div key={c.known_at} className="case-row">
              <i className={c.hit ? "h" : undefined} aria-label={c.hit ? "came true" : "didn't"} />
              <span className="case-what">
                <b>{c.entry_day}</b>
                <span className="note" style={{ display: "block" }}>{c.note}</span>
              </span>
              <span className="case-ret">
                <span className={c.ret < 0 ? "down" : "up"}>{pct(c.ret)}</span>
                {r.vs_market && <span className="note" style={{ display: "block" }}>SPY {c.market_ret == null ? "—" : pct(c.market_ret)}</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="tscroll case-table">
          <table>
            <thead><tr><th>Event</th><th>Entry (open)</th><th>Exit (close)</th><th className="num">Return</th>{r.vs_market && <th className="num">SPY</th>}<th>{r.vs_market ? "Worse than SPY?" : "Lower?"}</th></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.known_at}>
                  <td>{c.note}</td>
                  <td className="nowrap">{c.entry_day}</td>
                  <td className="nowrap">{c.exit_day}</td>
                  <td className={`num ${c.ret < 0 ? "down" : "up"}`}>{pct(c.ret)}</td>
                  {r.vs_market && <td className={`num ${(c.market_ret ?? 0) < 0 ? "down" : "up"}`}>{c.market_ret == null ? "—" : pct(c.market_ret)}</td>}
                  <td>{c.hit ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="lite-only">
        {cases.length > 0 && (
          <p className="note">
            Most recent, {ticker}&apos;s own move{r.vs_market ? " (and the market's)" : ""}:{" "}
            {cases.slice(-3).reverse().map((c) =>
              `${shortDate(c.entry_day)} ${pct(c.ret)}${r.vs_market && c.market_ret != null ? ` (SPY ${pct(c.market_ret)})` : ""}`).join(" · ")}
          </p>
        )}
      </div>
      <p className="note">Prices from the daily bars in Stone&apos;s database; events timed from SEC acceptance and FRED release.</p>
      <Link className="linkb" href={`/company/${ticker}`}>Open {ticker} ›</Link>
    </div>
  );
}
