'use client';
import { useEffect, useRef } from 'react';

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!;
    let raf = 0; const t0 = performance.now();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = () => { const r = c.getBoundingClientRect(); const d = Math.min(devicePixelRatio, 2); c.width = r.width * d; c.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    size(); addEventListener('resize', size);
    const tick = (now: number) => { const r = c.getBoundingClientRect(); draw(ctx, r.width, r.height, still ? 0 : (now - t0) / 1000); if (!still) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, [draw]);
  return ref;
}

/* Hero: slow sweeping arcs of light with a few accent glints — 10s seamless loop. */
const drawHero = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const p = (t % 10) / 10 * Math.PI * 2;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const cx = w * 0.62, cy = h * 0.55;
  for (let i = 0; i < 9; i++) {
    const rx = w * (0.18 + i * 0.045), ry = h * (0.34 + i * 0.03);
    const rot = -0.5 + Math.sin(p + i * 0.35) * 0.08;
    const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    const a = 0.08 + 0.06 * Math.sin(p + i);
    g.addColorStop(0, `rgba(120,140,170,${a})`); g.addColorStop(0.5, `rgba(220,228,240,${a + 0.18})`); g.addColorStop(1, `rgba(60,70,90,${a})`);
    ctx.strokeStyle = g; ctx.lineWidth = 18 - i * 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, Math.PI * 0.9, Math.PI * 2.05); ctx.stroke();
  }
  for (let k = 0; k < 6; k++) {
    const ang = p + k * 1.05; const x = cx + Math.cos(ang) * w * 0.3, y = cy + Math.sin(ang) * h * 0.38;
    const s = 0.5 + 0.5 * Math.sin(p * 2 + k);
    ctx.fillStyle = `rgba(212,175,55,${0.35 + 0.5 * s})`; ctx.fillRect(x, y, 3, 16);
  }
};

/* Join: field of falling vertical lines — 3.034s loop. */
const LINES = Array.from({ length: 140 }, (_, i) => ({ x: (i * 97.3) % 1, o: (i * 0.618) % 1, len: 30 + ((i * 37) % 30) }));
const drawJoin = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const p = (t % 3.034) / 3.034;
  ctx.fillStyle = '#0B0B0C'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
  for (const l of LINES) {
    const y = ((l.o + p) % 1) * (h + 120) - 60;
    ctx.beginPath(); ctx.moveTo(l.x * w, y); ctx.lineTo(l.x * w, y + l.len); ctx.stroke();
  }
};

export function HeroLoop() { const ref = useCanvas(drawHero); return <canvas ref={ref} aria-hidden="true" />; }
export function JoinLoop() { const ref = useCanvas(drawJoin); return <canvas ref={ref} aria-hidden="true" />; }
