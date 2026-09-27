"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToday } from "@/components/Today";
import { shortDate } from "@/lib/format";
import { WORTH_A_LOOK_WHY, worthALook } from "@/lib/words";

// The landing's countdown, the demo film's moment with real counts: everything Precedence read, down to what has
// come before drops for what you own. A field of gold dots thins out with the number (on a log scale) and, at the
// end, two glowing dots stand beside the final count. Drawn with requestAnimationFrame: the dots on one canvas, the
// number and its words moved by transforms only.

// Not served by the API yet (no all-time totals endpoint): the rows in insider_trades, counted in the database load
// as of the Sep 25, 2026 close (latest filing accepted that day).
const FORM4_TRADES = 35797;

const HOLD = 2.4; // seconds each step is on screen
const EASE = 0.9; // seconds the number takes to reach a step
const COLS = 40, ROWS = 35, N = COLS * ROWS; // the dot field
const GOLD = "#D4A73C", FINAL = "#F3D27A";

type Step = { n: number; label: string; sub?: string };

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** How many field dots stay lit for a count: log-scaled against the first step, one dot per unit at 5 and under. */
function kept(v: number, top: number, last: boolean): number {
  if (last) return 0;
  if (v <= 5.5) return Math.round(v);
  return Math.max(6, Math.round(N * Math.pow(Math.log(v) / Math.log(top), 2.2)));
}

export function DotCountdown({ symbols, example }: { symbols: string[]; example: boolean }) {
  const t = useToday(symbols);
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [{ n: FORM4_TRADES, label: "insider trades read from SEC Form 4s" }];
    if (t?.holdings) {
      const h = t.holdings, w = t.week;
      const mine = w && h.week_filings ? h.week_filings : h.filings;
      const all = w ? w.filings.count + (w.rate?.jumps.length ?? 0) : t.market.filings.count + (t.market.rate ? 1 : 0);
      out.push({ n: all, label: w ? "new this week, across the companies Precedence follows" : "new today, across the companies Precedence follows" });
      out.push({ n: mine.count + h.signals.firing, label: example ? "about the example portfolio" : "about what you own" });
      out.push({ n: h.signals.strong_firing, label: worthALook(h.signals.strong_firing), sub: WORTH_A_LOOK_WHY });
    }
    // A step we can't count is dropped, never filled in; counts must step down for the countdown to read right.
    return out.filter((s, i) => Number.isFinite(s.n) && s.n >= 1 && (i === 0 || s.n < out[i - 1].n));
  }, [t, example]);
  const asOf = t?.holdings?.signals.as_of ?? t?.day ?? null;

  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const num = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLParagraphElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const glowL = useRef<HTMLElement>(null);
  const glowR = useRef<HTMLElement>(null);
  const pips = useRef<HTMLSpanElement>(null);
  const [runId, setRunId] = useState(0); // bumped by Replay
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined"); // no observer: start at once

  // Start once it's on screen.
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  // The dot field: an offset grid scaled to the box, sorted so the dots around the number and caption go first
  // and the far edges next; the ones in between hold on longest.
  const field = useRef<{ x: number; y: number }[]>([]);
  const layout = useCallback(() => {
    const el = box.current, c = canvas.current;
    if (!el || !c) return { w: 0, h: 0, r: 0 };
    const w = el.clientWidth, h = el.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = w / (COLS + 0.5), sy = h / ROWS, cx = w / 2, cy = h * 0.45;
    const pts: { x: number; y: number; d: number }[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const px = sx * (x + 0.5 + (y % 2) * 0.5), py = sy * (y + 0.5);
      let d = Math.hypot(px - cx, (py - cy) * 1.6);
      if (Math.abs(px - cx) < w * 0.24 && py - cy > -h * 0.3 && py - cy < h * 0.46) d += 1e5; // the words' area clears first
      pts.push({ x: px, y: py, d });
    }
    pts.sort((a, b) => a.d - b.d);
    field.current = pts;
    return { w, h, r: Math.max(1.5, Math.min(5, sx * 0.2)) };
  }, []);

  useEffect(() => {
    if (!steps.length || !seen) return;
    const c = canvas.current, n = num.current, k = cap.current, el = box.current;
    if (!c || !n || !k || !el) return;
    const ctx = c.getContext("2d");
    let size = layout();
    const onResize = () => { size = layout(); };
    window.addEventListener("resize", onResize);
    const last = steps.length - 1, top = steps[0].n;
    const t0 = performance.now();
    const total = last * HOLD + EASE + 0.4;
    const still = reducedMotion();
    let raf = 0;

    const frame = (now: number) => {
      // A frame's timestamp can come before t0 (it's when the frame began), so never let time go negative.
      const time = still ? total : Math.max(0, (now - t0) / 1000);
      const i = Math.min(last, Math.floor(time / HOLD));
      const dt = time - i * HOLD, u = Math.min(1, dt / EASE), e = easeOut(u);
      const from = i === 0 ? 1 : steps[i - 1].n, to = steps[i].n;
      const v = Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * e); // eases on a log scale
      const done = i === last && u >= 1;
      n.textContent = Math.round(v).toLocaleString("en-US");
      // A punch as it lands: 1.35 falling back to 1.
      const punch = dt > EASE ? 1 + 0.35 * Math.exp(-(dt - EASE) * 7) : 1.04;
      n.style.transform = `scale(${punch.toFixed(3)})`;
      n.style.color = done ? FINAL : "#fff";
      k.textContent = steps[i].label;
      if (subRef.current) subRef.current.textContent = done ? steps[i].sub ?? "" : "";
      k.style.opacity = String(Math.min(1, dt / 0.4));
      pips.current?.querySelectorAll("i").forEach((p, j) => { p.className = j === i ? (i === last ? "on last" : "on") : ""; });

      // The field thins with the number; nothing is left at the final count but the two glowing dots.
      if (ctx) {
        ctx.clearRect(0, 0, size.w, size.h);
        const keep = kept(v, top, i === last && steps.length > 1);
        ctx.fillStyle = GOLD; ctx.globalAlpha = 0.28;
        for (let j = 0; j < keep && j < field.current.length; j++) {
          const p = field.current[j];
          ctx.beginPath(); ctx.arc(p.x, p.y, size.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const o = i === last && steps.length > 1 ? Math.min(1, dt / EASE) : 0;
      const nr = n.getBoundingClientRect(), br = el.getBoundingClientRect();
      const gap = Math.min(110, br.width * 0.12), cy = nr.top - br.top + nr.height / 2;
      [[glowL.current, nr.left - br.left - gap], [glowR.current, nr.right - br.left + gap]].forEach(([g, x]) => {
        const d = g as HTMLElement | null;
        if (!d) return;
        d.style.opacity = String(o);
        d.style.transform = `translate(${(x as number).toFixed(1)}px, ${cy.toFixed(1)}px) translate(-50%, -50%) scale(${(0.4 + 0.6 * o).toFixed(3)})`;
      });
      if (time < total) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [steps, seen, runId, layout]);

  if (!steps.length) return null;
  const final = steps[steps.length - 1];
  return (
    <div className="dcd" ref={box}>
      <p className="sr-only">{steps.map((s) => `${s.n.toLocaleString("en-US")} ${s.label}${s.sub ? `: ${s.sub}` : ""}`).join(". ")}.</p>
      <canvas ref={canvas} className="dcd-field" aria-hidden />
      <i ref={glowL} className="dcd-glow" aria-hidden />
      <i ref={glowR} className="dcd-glow" aria-hidden />
      <div className="dcd-center" aria-hidden>
        <div ref={num} className="dcd-num">{final.n.toLocaleString("en-US")}</div>
        <p ref={cap} className="dcd-cap">{final.label}</p>
        <p ref={subRef} className="dcd-sub">{final.sub ?? ""}</p>
        <span ref={pips} className="dcd-pips">{steps.map((s, j) => <i key={j} />)}</span>
        <p className="dcd-src">SEC EDGAR · FRED{asOf ? ` · as of ${shortDate(asOf)}` : ""}</p>
      </div>
      <button type="button" className="dcd-replay" onClick={() => { setSeen(true); setRunId((r) => r + 1); }}>Replay</button>
    </div>
  );
}
