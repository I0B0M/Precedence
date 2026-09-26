"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Today } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { FORM_WORDS } from "@/lib/words";

const SOURCES: Record<string, string> = { sec: "SEC EDGAR", fred: "FRED" };
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

type Filings = { count: number; by_form: Record<string, number> };

/** "21 SEC filings (14 company news (8-K), 6 insider trades, 1 quarterly report)". Form names keep their case ("8-K"). */
function filingWords(f: Filings, detail = true): string {
  const lower = (w: string) => w.charAt(0).toLowerCase() + w.slice(1); // "Company news (8-K)" -> "company news (8-K)"
  const many = (w: string, n: number) => (n > 1 && !/news|\)$/.test(w) ? w + "s" : w); // "insider trade" -> "insider trades"
  const parts = Object.entries(f.by_form).sort((a, b) => b[1] - a[1]).map(([form, n]) => `${n} ${many(lower(FORM_WORDS[form] ?? form), n)}`);
  return `${plural(f.count, "SEC filing")}${detail && parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** The day: "3 SEC filings (…) and 1 interest-rate move". Only what /api/today counted. */
function marketWords(t: Today, detail = true): string {
  const filings = filingWords(t.market.filings, detail);
  return t.market.rate ? `${filings} and 1 interest-rate move` : filings;
}

/** "Sep 19–25" (or "Sep 29 – Oct 3" across months). */
function span(start: string, end: string): string {
  const a = new Date(start + "T12:00:00"), b = new Date(end + "T12:00:00");
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return m(a) === m(b) ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
}

export function useToday(symbols: string[]) {
  const key = symbols.join(",");
  const [got, setGot] = useState<{ key: string; t: Today } | null>(null);
  useEffect(() => {
    api.today(key ? key.split(",") : []).then((t) => setGot({ key, t })).catch(() => {});
  }, [key]);
  return got?.key === key ? got.t : null;
}

/** The start screen's big number: what landed in Stone's data on the last trading day. Nothing shown if the API has nothing. */
export function TodayMarket({ t }: { t: Today }) {
  const f = t.market.filings, r = t.market.rate;
  const n = f.count + (r ? 1 : 0);
  if (!t.day) return null;
  const w = t.week;
  if (w) {
    const jumps = w.rate?.jumps.length ?? 0;
    const wn = w.filings.count + jumps;
    return (
      <div className="stack" style={{ gap: 6 }}>
        <span className="ticker">This week in the market</span>
        <div className="bignum count-in">{wn.toLocaleString("en-US")}</div>
        <p className="lede" style={{ color: "var(--text)" }}>
          new {wn === 1 ? "thing" : "things"} this week ({span(w.start, w.end)}) across the companies Stone follows:{" "}
          {filingWords(w.filings)}{jumps ? ` and ${plural(jumps, "interest-rate jump")}` : ""}.
        </p>
        <p>On {shortDate(t.day)} alone: {marketWords(t, false)}.</p>
        <p className="note">
          Filings from {SOURCES[w.filings.source] ?? w.filings.source}, {w.filings.companies} companies
          {w.rate ? `; 10-year Treasury rate ${w.rate.first_value.toFixed(2)}% → ${w.rate.last_value.toFixed(2)}% (${w.rate.change >= 0 ? "+" : ""}${w.rate.change.toFixed(2)} pt), from ${SOURCES[w.rate.source] ?? w.rate.source}` : ""}.
        </p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="ticker">Today in the market</span>
      <div className="bignum count-in">{n.toLocaleString("en-US")}</div>
      <p className="lede" style={{ color: "var(--text)" }}>
        new {n === 1 ? "thing" : "things"} in Stone&apos;s data for {shortDate(t.day)}: {marketWords(t)}.
      </p>
      <p className="note">
        Filings from {SOURCES[f.source] ?? f.source} for the companies Stone tracks
        {r ? `; 10-year Treasury rate ${r.value.toFixed(2)}% on ${shortDate(r.day)}, from ${SOURCES[r.source] ?? r.source}` : ""}.
      </p>
    </div>
  );
}

/** On the board: from everything that landed, down to what has mattered before for what you own. */
export function TodayFunnel({ symbols }: { symbols: string[] }) {
  const t = useToday(symbols);
  if (!t?.day || !t.holdings) return null;
  const h = t.holdings;
  const w = t.week;
  const all = w ? w.filings.count + (w.rate?.jumps.length ?? 0) : t.market.filings.count + (t.market.rate ? 1 : 0);
  const mine = w && h.week_filings ? h.week_filings : h.filings;
  const steps: [number, string][] = [
    [all, w ? `new this week (${span(w.start, w.end)}) across the companies Stone follows` : `new in Stone's data for ${shortDate(t.day)}: ${marketWords(t, false)}`],
    [mine.count, `SEC ${mine.count === 1 ? "filing" : "filings"} about what you own${w ? " this week" : ""}`],
    [h.signals.firing, `${h.signals.firing === 1 ? "signal" : "signals"} firing on what you own`],
  ];
  return (
    <div className="today">
      <span className="ticker">{w ? "This week" : "Today"}</span>
      <ol className="funnel">
        {steps.map(([n, label]) => (
          <li key={label}><b>{n}</b> <span>{label}</span></li>
        ))}
      </ol>
      {mine.items.length > 0 && (
        <ul className="funnel-items">
          {mine.items.map((i) => (
            <li key={`${i.ticker}-${i.accepted_at}-${i.form}`}>
              <b>{i.ticker}</b> {FORM_WORDS[i.form] ?? i.form}, {shortDate(i.accepted_at)}
              {i.url && <> · <a href={i.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}
            </li>
          ))}
        </ul>
      )}
      <p className="funnel-end">
        <span className="bignum">{h.signals.strong_firing}</span>
        <span>{h.signals.strong_firing === 1 ? "has" : "have"} mattered before for {h.signals.strong_firing === 1 ? "that holding" : "those holdings"}.</span>
      </p>
      <p className="note">
        Filings from SEC EDGAR; signals from Stone&apos;s engine on prices, SEC filings and FRED, as of {shortDate(h.signals.as_of ?? t.day)}.
        {h.signals.items.length > 0 && <> Firing: {h.signals.items.map((i) => `${i.symbol} (${i.label})`).join(", ")}.</>}
      </p>
    </div>
  );
}

const OWN = [
  { key: "stocks", label: "Stocks", sub: "Apple, Nvidia…" },
  { key: "funds", label: "Funds", sub: "ETFs and index funds" },
  { key: "crypto", label: "Crypto", sub: "Bitcoin, Ethereum…" },
  { key: "other", label: "Something else", sub: "Bonds, cash…" },
];

/** Three taps: what you own → bring it in → your board. Every option leads somewhere real. */
export function StartFlow() {
  const t = useToday([]);
  const [own, setOwn] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const toggle = (k: string) => setOwn(own.includes(k) ? own.filter((x) => x !== k) : [...own, k]);
  const notCovered = own.filter((k) => k === "crypto" || k === "other");

  return (
    <section className="stack" style={{ gap: 28 }}>
      {t && <TodayMarket t={t} />}

      <div className="card">
        <p className="list-head">Step {step} of 3</p>
        {step === 1 ? (
          <>
            <h2>What do you own?</h2>
            <p className="mute">Pick all that apply.</p>
            <div className="tiles">
              {OWN.map((o) => (
                <button key={o.key} type="button" className="tile" aria-pressed={own.includes(o.key)} onClick={() => toggle(o.key)}>
                  <b>{o.label}</b><span>{o.sub}</span>
                </button>
              ))}
            </div>
            <button className="btn" type="button" disabled={!own.length} onClick={() => setStep(2)} style={{ alignSelf: "flex-start" }}>Next</button>
          </>
        ) : (
          <>
            <h2>Bring it in</h2>
            {notCovered.length > 0 && (
              <p className="watchline">
                {notCovered.map((k) => OWN.find((o) => o.key === k)?.label).join(" and ")} {notCovered.length > 1 ? "aren't" : "isn't"} covered yet:
                Stone has no data or signals for {notCovered.length > 1 ? "them" : "it"}. You can still bring in your stocks and funds.
              </p>
            )}
            <div className="list">
              <div className="list-row" style={{ alignItems: "center" }}>
                <span><b>Connect Robinhood or Binance</b><span className="note" style={{ display: "block" }}>Read-only</span></span>
                <button className="btn light small" type="button" disabled>Connecting opens soon</button>
              </div>
              <div className="list-row" style={{ alignItems: "center" }}>
                <span><b>Add a screenshot</b><span className="note" style={{ display: "block" }}>Any app. We check the rows add up to the total on screen.</span></span>
                <Link className="btn small" href="/import">Add a screenshot</Link>
              </div>
              <div className="list-row" style={{ alignItems: "center" }}>
                <span><b>Type them in</b><span className="note" style={{ display: "block" }}>Ticker and shares</span></span>
                <Link className="btn light small" href="/import">Type them in</Link>
              </div>
            </div>
            <p className="note">Step 3 is your board: saving your holdings takes you there.</p>
            <button className="linkb" type="button" onClick={() => setStep(1)}>‹ Back</button>
          </>
        )}
      </div>
    </section>
  );
}
