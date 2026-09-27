"use client";

import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PortfolioOut } from "@/lib/api";
import { money, whole } from "@/lib/format";

type Tile = { key: string; symbol: string; name: string; value: number; state: "CALM" | "WATCH" | null; inside?: string; href: string | null };
type Node = { name: string; tile?: Tile; children?: Node[] };

/** Every dollar on the board as a tile: stocks you hold (with their slice inside your funds), and each fund split
 *  into the stocks it holds. Same numbers as the rows below, drawn to size. Layout: d3-hierarchy's squarified treemap. */
function tree(board: PortfolioOut): Node {
  const kinds = new Map(board.rows.map((r) => [r.symbol, r.kind]));
  return {
    name: "all",
    children: board.exposure.map((e): Node => {
      const fund = kinds.get(e.symbol) === "etf";
      if (!fund) {
        return { name: e.symbol, tile: { key: e.symbol, symbol: e.symbol, name: e.name, value: e.total, state: e.state, href: `/company/${e.symbol}` } };
      }
      const kids = e.children.reduce((a, k) => a + k.total, 0);
      return {
        name: e.symbol,
        children: [
          ...e.children.map((k) => ({ name: k.symbol, tile: { key: `${e.symbol}:${k.symbol}`, symbol: k.symbol, name: k.name, value: k.total, state: null, inside: e.symbol, href: `/company/${k.symbol}` } })),
          ...(e.total - kids > 0.5 ? [{ name: `${e.symbol} rest`, tile: { key: `${e.symbol}:rest`, symbol: e.symbol, name: `${e.name}: the part not split into stocks`, value: e.total - kids, state: e.state, href: `/fund/${e.symbol}` } }] : []),
        ],
      };
    }),
  };
}

export function OwnMap({ board }: { board: PortfolioOut }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = Math.round(Math.min(360, Math.max(240, w * 0.42)));
  const root = hierarchy<Node>(tree(board)).sum((d) => d.tile?.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const laid = treemap<Node>().tile(treemapSquarify.ratio(1.3)).size([w, h]).paddingInner(2).paddingOuter(0).round(true)(root);
  const leaves = laid.leaves().filter((l) => l.data.tile && l.x1 - l.x0 > 0 && l.y1 - l.y0 > 0) as HierarchyRectangularNode<Node>[];
  const funds = laid.children?.filter((c) => c.children) ?? [];
  const total = board.total;

  return (
    <div className="card ownmap pro-only pro-add" data-tour="ownmap">
      <h3>What you really own</h3>
      <p className="note">
        Tiles sized by dollars, fund holdings looked through (outlined groups). Gold = WATCH. Your investments only: a home or private fund isn&apos;t split.
      </p>
      <div ref={box} className="om-plot">
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`What you own, ${money(total)} in ${leaves.length} pieces`}>
          {leaves.map((l) => {
            const t = l.data.tile!;
            const tw = l.x1 - l.x0, th = l.y1 - l.y0;
            const big = tw > 58 && th > 36, huge = tw > 90 && th > 52;
            const watch = t.state === "WATCH";
            const body = (
              <g>
                <rect x={l.x0} y={l.y0} width={tw} height={th} rx={4}
                  fill={watch ? "var(--accent-fill)" : t.inside ? "var(--fill)" : "var(--bg)"}
                  stroke={t.inside ? "var(--bg)" : watch ? "var(--accent-fill)" : "var(--edge-c)"} strokeWidth={t.inside ? 1 : 1.5} />
                {big && (
                  <text x={l.x0 + 8} y={l.y0 + 20} fontSize={huge ? 15 : 12} fontWeight={700} fill={watch ? "var(--on-accent)" : "var(--text)"}>{t.symbol}</text>
                )}
                {huge && (
                  <text x={l.x0 + 8} y={l.y0 + 38} fontSize={12} fill={watch ? "var(--on-accent)" : "var(--text-2)"}>{money(t.value)} · {whole(t.value / total)}</text>
                )}
                <title>{`${t.symbol} · ${t.name}${t.inside ? ` (inside ${t.inside})` : ""}: ${money(t.value)}, ${whole(t.value / total)} of your investments${watch ? " · Heads up" : ""}`}</title>
              </g>
            );
            return t.href ? <Link key={t.key} href={t.href} aria-label={`${t.symbol}, ${money(t.value)}`}>{body}</Link> : <g key={t.key}>{body}</g>;
          })}
          {funds.map((f) => (
            <g key={f.data.name} pointerEvents="none">
              <rect x={f.x0 - 1} y={f.y0 - 1} width={f.x1 - f.x0 + 2} height={f.y1 - f.y0 + 2} rx={5} fill="none" stroke="var(--text)" strokeWidth={2} />
              {f.x1 - f.x0 > 80 && f.y1 - f.y0 > 30 && (
                <g>
                  <rect x={f.x0 + 4} y={f.y0 + 4} width={66} height={20} rx={4} fill="var(--text)" />
                  <text x={f.x0 + 37} y={f.y0 + 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--bg)">inside {f.data.name}</text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="note">Same dollars as the list below, at the close. A stock you also own through a fund is one box with both parts.</p>
    </div>
  );
}
