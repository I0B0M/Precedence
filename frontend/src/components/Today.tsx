"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Scan, type Today } from "@/lib/api";
import { Why } from "@/components/Why";
import { useMode } from "@/lib/mode";
import { shortDate } from "@/lib/format";
import { SHOW_CONNECT, SHOW_CRYPTO } from "@/lib/flags";
import { comingNext, useFeatures } from "@/lib/features";
import { FORM_WORDS, PROMISE_WORDS, SIGNAL_WORDS, strongCountWords } from "@/lib/words";

const SOURCES: Record<string, string> = { sec: "SEC EDGAR", fred: "FRED" };
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

type Filings = { count: number; by_form: Record<string, number> };

/** "21 SEC filings (14 company news (8-K), 6 insider trades, 1 quarterly report)". Form names keep their case ("8-K"). */
function filingWords(f: Filings, detail = true): string {
  const lower = (w: string) => w.charAt(0).toLowerCase() + w.slice(1); // "Company news (8-K)" -> "company news (8-K)"
  const many = (w: string, n: number) => (n > 1 && !/news|\)$/.test(w) ? w + "s" : w); // "insider trade" -> "insider trades"
  const keep = (w: string) => w.replace(/(\d)-([A-Z])/g, "$1\u2011$2"); // "8-K" with a non-breaking hyphen, so it never splits
  const parts = Object.entries(f.by_form).sort((a, b) => b[1] - a[1]).map(([form, n]) => `${n} ${keep(many(lower(FORM_WORDS[form] ?? form), n))}`);
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

/** The start screen's big number: what landed in our data on the last trading day. Nothing shown if the API has nothing. */
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
        <div className="bignum count-in" style={{ fontSize: "clamp(40px, 5vw, 48px)" }}>{wn.toLocaleString("en-US")}</div>
        <p className="lede" style={{ color: "var(--text)" }}>
          new filings and rate moves this week ({span(w.start, w.end)}).
        </p>
        <p className="pro-only">
          {filingWords(w.filings)}{jumps ? ` and ${plural(jumps, "interest-rate jump")}` : ""}. On {shortDate(t.day)} alone: {marketWords(t, false)}.
        </p>
        <p className="note">
          {w.filings.companies} companies{w.rate ? ` · 10-year rate ${w.rate.first_value.toFixed(2)}% → ${w.rate.last_value.toFixed(2)}%` : ""}
          <span className="pro-only"> · filings from {SOURCES[w.filings.source] ?? w.filings.source}{w.rate ? `, rate from ${SOURCES[w.rate.source] ?? w.rate.source}` : ""}</span>
        </p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="ticker">Today in the market</span>
      <div className="bignum count-in" style={{ fontSize: "clamp(40px, 5vw, 48px)" }}>{n.toLocaleString("en-US")}</div>
      <p className="lede" style={{ color: "var(--text)" }}>new filings and rate moves on {shortDate(t.day)}.</p>
      <p className="pro-only">{marketWords(t)}.</p>
      <p className="note">
        Filings from {SOURCES[f.source] ?? f.source} for the companies Precedence tracks
        {r ? `; 10-year Treasury rate ${r.value.toFixed(2)}% on ${shortDate(r.day)}, from ${SOURCES[r.source] ?? r.source}` : ""}.
      </p>
    </div>
  );
}

type Stage = { n: number; label: string };

/** The mockup's moment, with real numbers: the big number counts down stage by stage, leaving a struck-through trail.
 *  With prefers-reduced-motion it shows the final stage straight away.
 *  plain: the landing's version, each number with its words in both modes, dots for the step, starting once it's on screen. */
function Countdown({ stages, plain = false }: { stages: Stage[]; plain?: boolean }) {
  const last = stages.length - 1;
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(!plain);
  useEffect(() => {
    if (seen || !box.current || typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [seen]);
  const reduce = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [done, setDone] = useState(() => (reduce() ? last : 0)); // last stage fully reached
  const [label, setLabel] = useState(() => (reduce() ? last : 0)); // stage whose words are showing
  const [shown, setShown] = useState(() => stages[reduce() ? last : 0].n);

  // Timers, not requestAnimationFrame: rAF pauses in a background tab, which would leave the count stuck mid-way.
  useEffect(() => {
    if (!seen || done >= last) return;
    let step: ReturnType<typeof setTimeout> | undefined;
    const hold = setTimeout(() => {
      const from = stages[done].n, to = stages[done + 1].n, t0 = Date.now();
      setLabel(done + 1);
      const tick = () => {
        const p = from === to ? 1 : Math.min(1, (Date.now() - t0) / 700), eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(from + (to - from) * eased));
        if (p < 1) step = setTimeout(tick, 16);
        else setDone(done + 1);
      };
      tick();
    }, 1300);
    return () => { clearTimeout(hold); clearTimeout(step); };
  }, [seen, done, last, stages]);

  return (
    <div className={`countdown${plain ? " countdown-plain" : ""}`} ref={box}>
      <p className="sr-only">{stages.map((st) => `${st.n} ${st.label}`).join(". ")}.</p>
      <div aria-hidden>
        {!plain && label > 0 && (
          <p className="trail pro-only">{stages.slice(0, label).map((st, i) => <span key={i}><s>{st.n}</s> → </span>)}</p>
        )}
        <p className="countdown-now">
          <span className="bignum">{shown}</span>
          <span className={plain ? "countdown-label" : "pro-only"}>{stages[label].label}</span>
        </p>
        {plain && <p className="countdown-dots">{stages.map((_, i) => <i key={i} className={i <= label ? "on" : undefined} />)}</p>}
      </div>
    </div>
  );
}

/** The landing: this week's count stepping down to what has come before drops, for your holdings or the example.
 *  Real counts from /api/today, the same numbers as the board's funnel; plain words in Lite and Pro. */
export function WeekCountdown({ symbols, example }: { symbols: string[]; example: boolean }) {
  const t = useToday(symbols);
  const stages = useMemo<Stage[]>(() => {
    if (!t?.day || !t.holdings) return [];
    const h = t.holdings, w = t.week;
    const mine = w && h.week_filings ? h.week_filings : h.filings;
    const all = w ? w.filings.count + (w.rate?.jumps.length ?? 0) : t.market.filings.count + (t.market.rate ? 1 : 0);
    const out: Stage[] = [
      { n: all, label: w ? `new this week (${span(w.start, w.end)}) across the companies Precedence follows` : `new in our data for ${shortDate(t.day)}` },
      { n: mine.count + h.signals.firing, label: example ? "about the example portfolio" : "about what you own" },
      { n: h.signals.strong_firing, label: h.signals.strong_firing === 1 ? "has come before drops" : "have come before drops" },
    ];
    return out.filter((x) => Number.isFinite(x.n));
  }, [t, example]);
  if (!t?.holdings || !stages.length) return null;
  return (
    <div className="week-count">
      <Countdown stages={stages} plain />
      <p className="note">Filings from SEC EDGAR; signals from our engine on prices, SEC filings and FRED, as of {shortDate(t.holdings.signals.as_of ?? t.day ?? "")}.</p>
    </div>
  );
}

/** On the board: from everything that landed this week, down to what has mattered before for what you own. */
/** `alsoLite`: show it in Lite too (the home page has no board header to carry the count). */
export function TodayFunnel({ symbols, alsoLite = false }: { symbols: string[]; alsoLite?: boolean }) {
  const { mode } = useMode();
  const t = useToday(mode === "pro" || alsoLite ? symbols : []);
  const [scan, setScan] = useState<Scan | null>(null);
  useEffect(() => {
    api.scan().then(setScan).catch(() => {});
  }, []);
  const stages = useMemo<Stage[]>(() => {
    if (!t?.day || !t.holdings) return [];
    const h = t.holdings, w = t.week;
    const mine = w && h.week_filings ? h.week_filings : h.filings;
    const all = w ? w.filings.count + (w.rate?.jumps.length ?? 0) : t.market.filings.count + (t.market.rate ? 1 : 0);
    const out: (Stage | null)[] = [
      { n: all, label: w ? `new this week (${span(w.start, w.end)}) across the companies Precedence follows` : `new in our data for ${shortDate(t.day)}` },
      mine && h.signals ? { n: mine.count + h.signals.firing, label: `about what you own: ${plural(mine.count, "SEC filing")} and ${plural(h.signals.firing, "signal")} firing` } : null,
      h.signals ? { n: h.signals.strong_firing, label: strongCountWords(h.signals.strong_firing, true).replace(/^\d+ /, "") } : null,
    ];
    return out.filter((x): x is Stage => x !== null && Number.isFinite(x.n));
  }, [t]);
  // On the board Lite shows nothing here: its header already says how many things are worth a look.
  if ((mode !== "pro" && !alsoLite) || !t?.day || !t.holdings || !stages.length) return null;
  const h = t.holdings, w = t.week;
  const mine = w && h.week_filings ? h.week_filings : h.filings;
  const about = mine.count + h.signals.firing;
  // The one filing worth showing in Lite: from a holding whose signal has mattered before, else a report or company news.
  const strongSyms = new Set(h.signals.items.filter((i) => i.label === "STRONG").map((i) => i.symbol));
  const top = mine.items.find((i) => strongSyms.has(i.ticker))
    ?? mine.items.find((i) => ["8-K", "10-Q", "10-K"].includes(i.form)) ?? mine.items[0] ?? null;
  const filingRow = (i: typeof mine.items[number]) => (
    <><b>{i.ticker}</b> · {FORM_WORDS[i.form] ?? i.form} · {shortDate(i.accepted_at)}
      {i.url && <> · <a href={i.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}</>
  );
  return (
    <div className="today">
      <span className="ticker">{w ? "This week" : "Today"}</span>
      <Countdown stages={stages} />
      <p className="lite-only">
        {about} about what you own · {strongCountWords(h.signals.strong_firing)}
      </p>
      <p className="pro-only" style={{ margin: 0 }}>
        <Why what="have mattered before" scan={scan}
          rows={[
            ["Mattered before", h.signals.items.filter((i) => i.label === "STRONG").map((i) => `${i.symbol} (${SIGNAL_WORDS[i.signal] ?? i.signal})`).join(", ") || "none"],
            ["Firing now", h.signals.items.map((i) => `${i.symbol} ${SIGNAL_WORDS[i.signal] ?? i.signal} (${i.label})`).join(", ") || "none"],
            ["Rule", "STRONG only when the whole 90% range beats the stock's normal rate"],
          ]}
          source="our signal engine on prices, SEC filings and FRED" asOf={h.signals.as_of ?? t.day} />
      </p>
      {top && <p className="lite-only note">{filingRow(top)}</p>}
      {mine.items.length > 0 && (
        <ul className="funnel-items pro-only">
          {mine.items.map((i) => <li key={`${i.ticker}-${i.accepted_at}-${i.form}`}>{filingRow(i)}</li>)}
        </ul>
      )}
      <p className="note pro-only">
        {w ? `This week: ${filingWords(w.filings, false)}${w.rate?.jumps.length ? ` and ${plural(w.rate.jumps.length, "interest-rate jump")}` : ""}. ` : `${marketWords(t, false)}. `}
        Filings from SEC EDGAR; signals from our engine on prices, SEC filings and FRED, as of {shortDate(h.signals.as_of ?? t.day)}.
        {h.signals.items.length > 0 && <> Firing: {h.signals.items.map((i) => `${i.symbol} (${i.label})`).join(", ")}.</>}
      </p>
    </div>
  );
}

const OWN = [
  { key: "stocks", label: "Stocks", sub: "Apple, Nvidia…" },
  { key: "funds", label: "Funds", sub: "ETFs and index funds" },
  ...(SHOW_CRYPTO ? [{ key: "crypto", label: "Crypto", sub: "Bitcoin, Ethereum…" }] : []),
  { key: "other", label: "Something else", sub: "Bonds, cash…" },
];

/** Three taps: what you own → bring it in → your board. Every option leads somewhere real. */
export function StartFlow() {
  const t = useToday([]);
  const [own, setOwn] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const toggle = (k: string) => setOwn(own.includes(k) ? own.filter((x) => x !== k) : [...own, k]);
  const notCovered = own.filter((k) => k === "crypto" || k === "other");
  const shots = useFeatures().screenshots === true;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 10 }}>
        <h1 style={{ fontSize: "clamp(30px, 4.2vw, 40px)", lineHeight: 1.2, maxWidth: "22ch" }}>
          See what&apos;s happening to what you own, {PROMISE_WORDS.start}
        </h1>
        <p className="mute" style={{ fontSize: 16 }}>No account needed.</p>
      </div>
      {t && <TodayMarket t={t} />}

      <div className="card">
        <p className="list-head">Step {step} of 3</p>
        {step === 1 ? (
          <>
            <h2>What do you own?</h2>
            <div className="tiles">
              {OWN.map((o) => (
                <button key={o.key} type="button" className="tile" aria-pressed={own.includes(o.key)} onClick={() => toggle(o.key)}>
                  <b>{o.label}</b><span>{o.sub}</span>
                </button>
              ))}
            </div>
            <div className="row-flex">
              <button className="btn" type="button" disabled={!own.length} onClick={() => setStep(2)}>Next</button>
              <Link className="btn light" href="/import?example=1">Try an example portfolio</Link>
            </div>
          </>
        ) : (
          <>
            <h2>Bring it in</h2>
            {notCovered.length > 0 && (
              <p className="watchline">
                {notCovered.map((k) => OWN.find((o) => o.key === k)?.label).join(" and ")} {notCovered.length > 1 ? "aren't" : "isn't"} covered yet.
              </p>
            )}
            {/* Only paths that work tonight; the ones waiting on keys are one quiet line under them. */}
            <div className="list">
              <div className="list-row" style={{ alignItems: "center" }}>
                <span><b>Try an example</b><span className="note" style={{ display: "block" }}>Real prices, not saved</span></span>
                <Link className="btn small" href="/import?example=1">Try an example</Link>
              </div>
              <div className="list-row" style={{ alignItems: "center" }}>
                <span><b>Type them in</b><span className="note" style={{ display: "block" }}>Ticker and shares</span></span>
                <Link className="btn light small" href="/import">Type them in</Link>
              </div>
              <div className="list-row" style={{ alignItems: "center" }}>
                <span><b>A home or 401(k)</b><span className="note" style={{ display: "block" }}>Address or fund name</span></span>
                <Link className="btn light small" href="/import#other">Add one</Link>
              </div>
              {shots && (
                <div className="list-row" style={{ alignItems: "center" }}>
                  <span><b>Add a screenshot</b><span className="note" style={{ display: "block" }}>Any app</span></span>
                  <Link className="btn light small" href="/import">Add a screenshot</Link>
                </div>
              )}
              {SHOW_CONNECT && (
                <div className="list-row" style={{ alignItems: "center" }}>
                  <span><b>Connect Robinhood{SHOW_CRYPTO ? " or Binance" : ""}</b><span className="note" style={{ display: "block" }}>Read-only</span></span>
                  <Link className="btn light small" href="/import">Connect</Link>
                </div>
              )}
            </div>
            {!(SHOW_CONNECT && shots) && <p className="note">{comingNext(shots)}</p>}
            <button className="linkb" type="button" onClick={() => setStep(1)}>‹ Back</button>
          </>
        )}
      </div>
    </section>
  );
}
