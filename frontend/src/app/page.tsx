"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StateBadge } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { HeroLoop } from "@/components/landing/Loops";
import { Stage } from "@/components/briefing/Stage";
import { Features } from "@/components/landing/Features";
import { useToday, WeekCountdown } from "@/components/Today";
import { api, EXAMPLE_PORTFOLIO, type CompanyDetail, type PortfolioOut } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { useHoldings } from "@/lib/holdings";
import { portfolioExtras, useOtherAssets } from "@/lib/other-assets";

type Chip = { key: string; label: React.ReactNode; row?: number }; // row: index into the card's rows, for the line
type LinePos = { key: string; x1: number; y1: number; x2: number; y2: number };

// The chips' own spots around the orb (desktop only — hidden on a phone, see briefing.css). Tuned for the
// ~340px orb Stage renders in the hero; negative offsets are the point, so a couple can overlap the card's edge.
const CHIP_POS: React.CSSProperties[] = [
  { top: -16, left: "50%", transform: "translateX(-50%)" },
  { top: 36, left: -78 },
  { top: 168, left: -96 },
  { top: 224, right: -58 },
  { top: 64, right: -92 },
];

// Brief: "more accessible … engaging" · "understanding what they own". Trimmed to the hero, the portfolio
// card and 3 tiles (owner's call) — the bands that used to run below are gone.
export default function Home() {
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});
  const [mine] = useHoldings(null); // your saved holdings: the portfolio card shows your total, not the example
  const other = useOtherAssets();
  const extras = JSON.stringify(portfolioExtras(other));
  const [myBoard, setMyBoard] = useState<PortfolioOut | null>(null);
  const mineKey = mine?.length ? JSON.stringify(mine) : "";
  useEffect(() => {
    if (!mineKey) return;
    api.portfolio(JSON.parse(mineKey), JSON.parse(extras)).then(setMyBoard).catch(() => {});
  }, [mineKey, extras]);
  const returning = !!mine?.length;

  useEffect(() => {
    api.portfolio(EXAMPLE_PORTFOLIO).then(setBoard).catch(() => {});
    Promise.all(EXAMPLE_PORTFOLIO.map((h) => api.company(h.symbol).then((d) => [h.symbol, d.prices.slice(-30)] as const).catch(() => null)))
      .then((p) => setSparks(Object.fromEntries(p.filter((x) => x !== null))));
  }, []);

  // The chips around the orb: real numbers already on this page. Three carry a line to their row in the card;
  // the total and the week count don't point at one row in particular, so they don't get a line.
  const t = useToday(EXAMPLE_PORTFOLIO.map((h) => h.symbol));
  const week = useMemo(() => {
    if (!t?.day || !t.holdings) return null;
    const h = t.holdings, w = t.week;
    const all = w ? w.filings.count + (w.rate?.jumps.length ?? 0) : t.market.filings.count + (t.market.rate ? 1 : 0);
    const mineCount = (w && h.week_filings ? h.week_filings : h.filings).count + h.signals.firing;
    return [all, mineCount, h.signals.strong_firing];
  }, [t]);
  const cardBoard = returning ? myBoard : board;
  const stateOf = (sym: string) => cardBoard?.exposure.find((e) => e.symbol === sym)?.state ?? null;
  const stateWord = (sym: string) => (stateOf(sym) === "WATCH" ? "Heads up" : cardBoard ? "Calm" : "…");
  const cardRows = returning ? (mine ?? []) : EXAMPLE_PORTFOLIO;
  const chips: Chip[] = [
    { key: "total", label: <><b>{cardBoard ? money(cardBoard.subtotals?.total ?? cardBoard.total) : "…"}</b> total</> },
    ...cardRows.slice(0, 3).map((h, i): Chip => ({ key: h.symbol, label: <><b>{h.symbol}</b> {stateWord(h.symbol)}</>, row: i })),
    ...(week ? [{ key: "week", label: <>{week.join(" → ")} <b>this week</b></> }] : []),
  ];

  const [focusTicker, setFocusTicker] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lines, setLines] = useState<LinePos[]>([]);

  useEffect(() => {
    function measure() {
      const grid = gridRef.current;
      if (!grid) return;
      const base = grid.getBoundingClientRect();
      const next: LinePos[] = [];
      for (const c of chips) {
        if (c.row == null) continue;
        const chipEl = chipRefs.current[c.key];
        const rowEl = rowRefs.current[c.row];
        if (!chipEl || !rowEl) continue;
        const a = chipEl.getBoundingClientRect(), b = rowEl.getBoundingClientRect();
        next.push({
          key: c.key,
          x1: a.left + a.width / 2 - base.left, y1: a.top + a.height / 2 - base.top,
          x2: b.left - base.left, y2: b.top + b.height / 2 - base.top,
        });
      }
      setLines(next);
    }
    measure();
    window.addEventListener("resize", measure);
    // The card's own numbers (and so its layout) arrive after a fetch; a few retries catch it settling in.
    const id = setInterval(measure, 400);
    const stop = setTimeout(() => clearInterval(id), 4000);
    return () => { window.removeEventListener("resize", measure); clearInterval(id); clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardBoard, week, returning]);

  return (
    <div className="home">
      {/* ---- hero + the example portfolio ---- */}
      <section className="home-band home-hero" aria-label="Precedence">
        <div className="home-hero-bg" aria-hidden><HeroLoop /></div>
        <div className="home-inner home-hero-grid" ref={gridRef} style={{ position: "relative" }}>
          <svg className="hero-orb-lines" aria-hidden="true">
            {lines.map((l) => (
              <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={focusTicker === l.key ? "lit" : undefined} />
            ))}
          </svg>
          <div className="stack" style={{ gap: 20 }}>
            {/* The owner's message, first: everything you own on one screen. */}
            <h1>All your investments in one place.</h1>
            <p className="lede">
              Stocks, funds, your 401(k) and your home, together. Then see whether news like today&rsquo;s has come
              before a drop for the stocks you own. It doesn&rsquo;t predict.{" "}
              <Link className="home-link" href="/signals">How we check</Link>
            </p>
            <div className="home-ctas">
              {returning ? <>
                <Link className="btn" href="/portfolio">Open your portfolio</Link>
                <Link className="btn light" href="/import">Add more</Link>
              </> : <>
                <Link className="btn" href="/import?example=1">Try it with an example</Link>
                <Link className="btn light" href="/import">Add your account</Link>
              </>}
            </div>
            {/* The briefing, in the hero: yours when you've added holdings, the example until then. */}
            <div className="hero-orb-wrap">
              <Stage fallback={EXAMPLE_PORTFOLIO} compact onFocusChange={setFocusTicker} />
              {chips.map((c, i) => (
                <div key={c.key} ref={(el) => { chipRefs.current[c.key] = el; }}
                  className={`orb-chip${focusTicker === c.key ? " lit" : ""}`} style={CHIP_POS[i]}>
                  {c.label}
                </div>
              ))}
            </div>
          </div>
          {returning ? (
            // Coming back: your own total first, never the example.
            <Link className="card home-example" href="/portfolio" aria-label="Your portfolio: open it">
              <span className="home-example-top"><span className="kicker">Your portfolio</span>
                <span className="note">{myBoard?.price_as_of ? `Close ${shortDate(myBoard.price_as_of)}` : "Loading…"}</span></span>
              <span className="bignum price home-example-total">{myBoard ? money(myBoard.subtotals?.total ?? myBoard.total) : "—"}</span>
              {myBoard?.subtotals?.includes_home_estimate && <span className="note">Includes a home estimate</span>}
              {/* Your three largest holdings, with their badges. */}
              {[...(myBoard?.rows ?? [])].sort((a, b) => b.value - a.value).slice(0, 3).map((r, i) => {
                const e = myBoard?.exposure.find((x) => x.symbol === r.symbol);
                return (
                  <span className="home-example-row" key={r.symbol} ref={(el) => { rowRefs.current[i] = el; }}>
                    <span><b>{r.symbol}</b><small className="note">{r.name}</small></span>
                    <span />
                    <span className="home-num">{money(r.value)}
                      <small className={r.change != null && r.change < 0 ? "down" : "up"}>{r.change != null ? pct(r.change) : ""}</small></span>
                    {e ? <StateBadge state={e.state} /> : <span />}
                  </span>
                );
              })}
              <span className="note">Open your portfolio ›</span>
            </Link>
          ) : (
          <Link className="card home-example" href="/import?example=1" aria-label="Example portfolio: open it">
            <span className="home-example-top"><span className="kicker">Example</span>
              <span className="note">{board?.price_as_of ? `Close ${shortDate(board.price_as_of)}` : "Loading…"}</span></span>
            <span className="bignum home-example-total">{board ? money(board.total) : "—"}</span>
            {EXAMPLE_PORTFOLIO.map((h, i) => {
              const row = board?.rows.find((r) => r.symbol === h.symbol);
              const e = board?.exposure.find((x) => x.symbol === h.symbol);
              const spk = sparks[h.symbol];
              const down = spk && spk.length > 1 && spk[spk.length - 1].close < spk[0].close;
              return (
                <span className="home-example-row" key={h.symbol} ref={(el) => { rowRefs.current[i] = el; }}>
                  <span><b>{h.symbol}</b><small className="note">{h.shares} shares</small></span>
                  <span className={down ? "down" : "up"}>{spk ? <Spark closes={spk.map((p) => p.close)} /> : <span className="spark" />}</span>
                  <span className="home-num">{row ? money(row.value) : "—"}
                    <small className={row?.change != null && row.change < 0 ? "down" : "up"}>{row?.change != null ? pct(row.change) : ""}</small></span>
                  {e ? <StateBadge state={e.state} /> : <span />}
                </span>
              );
            })}
            <span className="note pro-only">Prices from Alpaca (IEX); badges from our tests on SEC and FRED data.</span>
          </Link>
          )}
        </div>
      </section>

      {/* ---- this week, counted down: everything new, then what's about what you own, then what has come before drops ---- */}
      <section className="home-band" aria-label="This week">
        <div className="home-inner">
          <WeekCountdown symbols={(returning ? mine! : EXAMPLE_PORTFOLIO).map((h) => h.symbol)} example={!returning} />
        </div>
      </section>

      {/* ---- the rest of what Precedence does, one card each ---- */}
      <section className="home-band" aria-label="More">
        <div className="home-inner">
          <Features />
        </div>
      </section>
    </div>
  );
}
