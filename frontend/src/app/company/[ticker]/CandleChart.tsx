"use client";

import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, type SeriesMarker, type Time } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Case } from "@/lib/api";

type Bar = { day: string; open: number; high?: number; low?: number; close: number };

interface Props {
  bars: Bar[]; // the chosen range, oldest first; every bar has high and low
  cases: Case[]; // past cases of the chosen signal: a mark under the bar they entered on
  firing: boolean;
  height: number;
  mode: "lite" | "pro";
  onHover: (i: number | null) => void; // index into `bars`, for the price header
}

/** Daily candles (TradingView lightweight-charts), with the same marks as the line chart: filled = came true. */
export function CandleChart({ bars, cases, firing, height, mode, onHover }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const hover = useRef(onHover);
  const data = useRef({ bars, cases });
  useEffect(() => {
    hover.current = onHover;
    data.current = { bars, cases };
  });
  // The parent re-slices its arrays on every render (each hover); rebuild the chart only when what's drawn changes.
  const drawn = `${bars.length}:${bars[0]?.day}:${bars[bars.length - 1]?.day}|${cases.map((c) => c.entry_day + (c.hit ? "+" : "-")).join(",")}`;

  useEffect(() => {
    const box = el.current;
    const { bars, cases } = data.current;
    if (!box || bars.length < 2) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const chart = createChart(box, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: v("--bg") }, textColor: v("--text-2"), fontFamily: css.fontFamily },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--sep") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: v("--up"), downColor: v("--down"), borderVisible: false, wickUpColor: v("--up"), wickDownColor: v("--down"),
    });
    series.setData(bars.map((b) => ({ time: b.day as Time, open: b.open, high: b.high ?? Math.max(b.open, b.close), low: b.low ?? Math.min(b.open, b.close), close: b.close })));

    const days = new Set(bars.map((b) => b.day));
    const marks: SeriesMarker<Time>[] = cases.filter((c) => days.has(c.entry_day)).map((c) => ({
      time: c.entry_day as Time, position: "belowBar", shape: "circle", color: c.hit ? v("--accent") : v("--mark"),
    }));
    if (firing) marks.push({ time: bars[bars.length - 1].day as Time, position: "aboveBar", shape: "arrowDown", color: v("--accent") });
    marks.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    createSeriesMarkers(series, marks);
    chart.timeScale().fitContent();

    const index = new Map(bars.map((b, i) => [b.day, i]));
    chart.subscribeCrosshairMove((p) => {
      const t = typeof p.time === "string" ? p.time : null;
      hover.current(t && index.has(t) ? index.get(t)! : null);
    });
    return () => chart.remove();
  }, [drawn, firing, height, mode]);

  return <div ref={el} className="sc-candles" style={{ height }} onPointerLeave={() => hover.current(null)} />;
}
