"use client";

import { useEffect, useRef, useState } from "react";
import type { SignalResult } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { useMode } from "@/lib/mode";

// Trading days per range. "2Y" is everything the API sent (about 528 days).
const RANGES = [
  { key: "1W", days: 5, words: "past week" },
  { key: "1M", days: 21, words: "past month" },
  { key: "3M", days: 63, words: "past 3 months" },
  { key: "1Y", days: 252, words: "past year" },
  { key: "2Y", days: Infinity, words: "past 2 years" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

interface Props {
  ticker: string;
  name: string;
  prices: { day: string; close: number }[];
  signals: SignalResult[];
  /** the signal whose past cases get ticks first (the page's headline signal) */
  initialSignal?: string;
  badge?: React.ReactNode;
  kicker: string;
}

/** Chart-first header: one big price, the change in colour, the line, range tabs underneath.
 *  Ticks under the line mark every past case of the chosen signal (filled = it came true), so you can see
 *  where the "Does it matter?" dots come from. Hover or drag to read any day. */
export function StockChart({ ticker, name, prices, signals, initialSignal, badge, kicker }: Props) {
  const { mode } = useMode();
  const pro = mode === "pro";
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [range, setRange] = useState<RangeKey>("2Y");
  const withCases = signals.filter((s) => (s.cases?.length ?? 0) > 0 || s.firing);
  const [sig, setSig] = useState<string | null>(initialSignal && withCases.some((s) => s.signal === initialSignal) ? initialSignal : withCases[0]?.signal ?? null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (prices.length < 2) return <p className="note">No price history yet.</p>;

  const r = RANGES.find((x) => x.key === range)!;
  const view = prices.slice(Math.max(0, prices.length - 1 - r.days));
  const first = view[0], last = view[view.length - 1];
  const shown = hover != null ? view[hover] : last;
  const diff = shown.close - first.close;
  const rel = diff / first.close;
  const dir = diff < 0 ? "down" : "up";

  const H = Math.round(Math.min(300, Math.max(200, w * 0.34)));
  const L = 0, R = pro ? 48 : 0, T = 12, B = 28; // B leaves room for event ticks
  const closes = view.map((p) => p.close);
  let lo = Math.min(...closes), hi = Math.max(...closes);
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const x = (i: number) => L + (i / (view.length - 1)) * (w - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = view.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join("");

  const chosen = signals.find((s) => s.signal === sig) ?? null;
  const index = new Map(view.map((p, i) => [p.day, i]));
  const at = (day: string) => index.get(day) ?? (day >= first.day && day <= last.day ? view.findIndex((p) => p.day >= day) : -1);
  const ticks = (chosen?.cases ?? []).map((c) => ({ i: at(c.entry_day), hit: c.hit, day: c.entry_day })).filter((t) => t.i >= 0);
  const firingI = chosen?.firing ? view.length - 1 : -1;
  const outside = (chosen?.cases?.length ?? 0) - ticks.length;

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const f = (clientX - rect.left - L) / (rect.width - L - R);
    setHover(Math.max(0, Math.min(view.length - 1, Math.round(f * (view.length - 1)))));
  };

  return (
    <section className="sc" aria-label={`${name} price`}>
      <div className="sc-head">
        <span className="kicker">{kicker}</span>
        <div className="sc-title">
          <h1>{name}</h1>
          {badge}
        </div>
        <div className="sc-price" aria-live="polite">{money(shown.close, true)}</div>
        <p className="sc-change">
          <span className={dir}>{diff < 0 ? "−" : "+"}{money(Math.abs(diff), true)} ({pct(rel)})</span>
          <span className="mute"> {hover != null ? `since ${shortDate(first.day)} · ${shortDate(shown.day)}` : r.words}</span>
        </p>
      </div>

      <div className="sc-plot" ref={box}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg key={range} className="sc-svg" viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
          aria-label={`${ticker} daily closes ${shortDate(first.day)} to ${shortDate(last.day)}: ${money(first.close, true)} to ${money(last.close, true)}, ${pct(rel)}`}>
          <line x1={L} x2={w - R} y1={y(first.close)} y2={y(first.close)} stroke="var(--mark)" strokeWidth="1" strokeDasharray="1 4" strokeLinecap="round" />
          {pro && [hi - pad, lo + pad].map((v, k) => (
            <text key={k} x={w - R + 8} y={y(v)} fontSize="11" fill="var(--text-2)" dominantBaseline="central">{money(v)}</text>
          ))}
          <path d={path} fill="none" stroke={`var(--${dir})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={x(t.i)} x2={x(t.i)} y1={y(view[t.i].close)} y2={H - 14} stroke="var(--accent)" strokeOpacity="0.25" />
              <circle cx={x(t.i)} cy={H - 8} r="4.5" fill={t.hit ? "var(--accent)" : "var(--bg)"} stroke="var(--accent)" strokeWidth="1.5">
                <title>{`${shortDate(t.day)} · ${t.hit ? "came true" : "didn't"}`}</title>
              </circle>
            </g>
          ))}
          {firingI >= 0 && (
            <circle cx={x(firingI)} cy={H - 8} r="6" fill="none" stroke="var(--accent)" strokeWidth="2"><title>Happening now</title></circle>
          )}
          {hover != null ? (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B + 4} stroke="var(--text-2)" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(view[hover].close)} r="4.5" fill={`var(--${dir})`} stroke="var(--bg)" strokeWidth="2" />
            </>
          ) : (
            <circle cx={x(view.length - 1)} cy={y(last.close)} r="4" fill={`var(--${dir})`} />
          )}
        </svg>
      </div>

      <div className="sc-ranges" role="tablist" aria-label="Chart range">
        {RANGES.map((x) => (
          <button key={x.key} role="tab" aria-selected={range === x.key} onClick={() => { setRange(x.key); setHover(null); }}>{x.key}</button>
        ))}
      </div>

      {withCases.length > 0 && (
        <div className="sc-events">
          <span className="kicker">Marks under the line</span>
          <div className="sc-chips" role="radiogroup" aria-label="Show past cases of">
            {withCases.map((s) => (
              <button key={s.signal} role="radio" aria-checked={sig === s.signal} onClick={() => setSig(s.signal)}>
                {pro ? s.pro : s.lite} <span className="mute">{s.cases?.length ?? 0}</span>
              </button>
            ))}
          </div>
          {chosen && (
            <p className="note">
              <i className="dotmark h" /> came true · <i className="dotmark" /> didn&apos;t
              {chosen.firing ? <> · <i className="dotmark now" /> happening now</> : null}
              {outside > 0 ? ` · ${outside} earlier case${outside > 1 ? "s" : ""} outside this range` : ""}
            </p>
          )}
        </div>
      )}
      <p className="note">Daily closes {shortDate(first.day)} – {shortDate(last.day)}, from Alpaca (IEX feed).</p>
    </section>
  );
}
