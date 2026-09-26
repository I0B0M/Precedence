"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HitDots, LabelTag } from "@/components/bits";
import { api, type CompanyRow, type SignalResult } from "@/lib/api";
import { horizonWords, pct, shortDate, whole } from "@/lib/format";
import { liteHistory, liteVerdict } from "@/lib/words";

type Spec = { key: string; lite: string; pro: string; horizon: number };

// Brief: "discover trends and risks" · "turn information into meaningful insight" · "engaging"
export default function SignalLab() {
  const [stocks, setStocks] = useState<CompanyRow[]>([]);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [ticker, setTicker] = useState<string | null>(null);
  const [signal, setSignal] = useState<string | null>(null);
  const [result, setResult] = useState<SignalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    Promise.all([api.companies(), api.labSignals()]).then(([cos, sp]) => {
      const st = cos.filter((c) => c.kind === "stock");
      setStocks(st);
      setSpecs(sp);
      setTicker(q.get("t") && st.some((c) => c.ticker === q.get("t")) ? q.get("t") : st[0]?.ticker ?? null);
      setSignal(q.get("s") && sp.some((s) => s.key === q.get("s")) ? q.get("s") : sp[0]?.key ?? null);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!ticker || !signal) return;
    setResult(null);
    api.lab(ticker, signal).then(setResult).catch((e) => setError(e.message));
    try {
      window.history.replaceState(null, "", `/lab?t=${ticker}&s=${signal}`);
    } catch {}
  }, [ticker, signal]);

  if (error) return <div className="badline">{error}</div>;

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="ticker">Signal lab</span>
        <h1>Has this ever mattered?</h1>
        <p className="mute" style={{ maxWidth: "60ch" }}>
          <span className="lite-only">Pick a stock and a kind of news. We check every time it happened in the last two years and what the stock did next.</span>
          <span className="pro-only">Two years per stock. Entry at the next open after the event was public; hit = lower after the horizon.
            Compared with the same stock&apos;s normal days; 90% Wilson range.</span>
        </p>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <b>Stock</b>
        <div className="tiles">
          {stocks.map((c) => (
            <button key={c.ticker} type="button" className="tile" aria-pressed={ticker === c.ticker} onClick={() => setTicker(c.ticker)}>
              <b>{c.ticker}</b><span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <b>Signal</b>
        <div className="tiles">
          {specs.map((s) => (
            <button key={s.key} type="button" className="tile" aria-pressed={signal === s.key} onClick={() => setSignal(s.key)}>
              <b className="lite-only">{s.lite}</b><b className="pro-only">{s.pro}</b>
              <span>then {horizonWords(s.horizon)}</span>
            </button>
          ))}
        </div>
      </div>

      {!result ? <p className="mute">Testing…</p> : <LabResult r={result} ticker={ticker!} />}
    </section>
  );
}

function LabResult({ r, ticker }: { r: SignalResult; ticker: string }) {
  const cases = r.cases ?? [];
  return (
    <div className="card">
      <div className="row-flex" style={{ justifyContent: "space-between" }}>
        <h2>{ticker}: <span className="lite-only">{r.lite.toLowerCase()}</span><span className="pro-only">{r.pro}</span></h2>
        <LabelTag label={r.label} />
      </div>
      <p style={{ fontSize: 18 }}>{liteHistory(r, ticker)} <b>{liteVerdict(r)}</b></p>
      <HitDots cases={cases} />

      {r.n > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <span className="note">
            <span className="lite-only">The black bar is where the real rate likely is. The dashed line is a normal {horizonWords(r.horizon).replace("a ", "")}.
              If the whole bar is right of the line, it&apos;s a real pattern.</span>
            <span className="pro-only">90% Wilson interval for P(lower after {r.horizon}d) vs normal-day rate ({r.normal_hits}/{r.normal_n}).</span>
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

      {r.firing && (
        <p className={r.label === "STRONG" ? "badline" : "okline"}>
          <b>Happening now:</b> {r.firing.note}.{" "}
          {r.label === "STRONG" ? "This is why the stock is on WATCH." : "Not proven for this stock, so it stays CALM."}
        </p>
      )}

      <div className="pro-only">
        <div className="tscroll">
          <table>
            <thead><tr><th>Event</th><th>Entry (open)</th><th>Exit (close)</th><th className="num">Return</th><th>Lower?</th></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.known_at}>
                  <td>{c.note}</td>
                  <td>{c.entry_day}</td>
                  <td>{c.exit_day}</td>
                  <td className={`num ${c.ret < 0 ? "down" : "up"}`}>{pct(c.ret)}</td>
                  <td>{c.hit ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="lite-only">
        {cases.length > 0 && (
          <p className="note">Most recent: {cases.slice(-3).reverse().map((c) => `${shortDate(c.entry_day)} (${pct(c.ret)})`).join(" · ")}</p>
        )}
      </div>
      <Link className="linkb" href={`/company/${ticker}`}>Open {ticker}</Link>
    </div>
  );
}
