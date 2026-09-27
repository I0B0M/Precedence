"use client";

import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PortfolioOut } from "@/lib/api";
import { money, whole } from "@/lib/format";

type Tile = { key: string; symbol: string; name: string; value: number; state: "CALM" | "WATCH" | null; inside?: string; more?: number; href: string | null };
type Node = { name: string; tile?: Tile; fund?: { symbol: string; value: number; state: "CALM" | "WATCH" | null }; children?: Node[] };

const TOP = 6; // at most this many holdings shown per fund; the rest of the fund is one "+N more" tile
const OWN_TILE = 0.15; // a holding gets its own tile inside a fund only at 15% of that fund or more (smaller ones would be unlabelled slivers)

/** Every dollar on the board as a tile: stocks you hold (with their slice inside your funds), and each fund as a group
 *  of its largest holdings plus one tile for the rest. Same numbers as the rows below, drawn to size. Layout:
 *  d3-hierarchy's squarified treemap. */
function tree(board: PortfolioOut): Node {
  const kinds = new Map(board.rows.map((r) => [r.symbol, r.kind]));
  return {
    name: "all",
    children: board.exposure.map((e): Node => {
      const fund = kinds.get(e.symbol) === "etf";
      if (!fund) {
        // A 401(k)/IRA fund has no stock page: it opens the index it behaves like, as its row below does.
        const retire = board.retirement?.find((r) => (r.ticker ?? r.fund) === e.symbol);
        const href = retire ? (retire.behaves_like ? `/fund/${retire.behaves_like}` : null) : `/company/${e.symbol}`;
        return { name: e.symbol, tile: { key: e.symbol, symbol: e.symbol, name: e.name, value: e.total, state: e.state, href } };
      }
      const kids = [...e.children].sort((x, y) => y.total - x.total);
      const top = kids.slice(0, TOP).filter((k) => k.total >= OWN_TILE * e.total);
      const rest = e.total - top.reduce((a, k) => a + k.total, 0);
      // No holding big enough for its own tile: the fund is one tile, not a group around a copy of itself.
      if (!top.length) {
        return { name: e.symbol, tile: { key: e.symbol, symbol: e.symbol, name: `${e.name}: ${kids.length} holdings`, value: e.total, state: e.state, href: `/fund/${e.symbol}` } };
      }
      return {
        name: e.symbol,
        fund: { symbol: e.symbol, value: e.total, state: e.state },
        children: [
          ...top.map((k) => ({ name: k.symbol, tile: { key: `${e.symbol}:${k.symbol}`, symbol: k.symbol, name: k.name, value: k.total, state: null, inside: e.symbol, href: `/company/${k.symbol}` } })),
          ...(rest > 0.5 ? [{ name: `${e.symbol} rest`, tile: { key: `${e.symbol}:rest`, symbol: `+${kids.length - top.length} more`, name: `${e.name}: the rest of the fund`, value: rest, state: null, inside: e.symbol, more: kids.length - top.length, href: `/fund/${e.symbol}` } }] : []),
        ],
      };
    }),
  };
}

const LABEL_W = 56, LABEL_H = 40; // below this a tile shows no text (its tooltip still names it)
const TITLE = 26; // a fund group's title row

/** Rough text width in px for this site's font (about 0.6em a character), to decide what fits in a tile. */
const fits = (s: string, size: number, room: number) => s.length * size * 0.6 <= room;

/** The small WATCH badge, top-right of a tile or a group title. */
function Badge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 50} y={y} width={50} height={18} rx={9} fill="var(--gold)" />
      <text x={x - 25} y={y + 13} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--on-accent)">WATCH</text>
    </g>
  );
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

  // Taller on a phone, so more tiles are big enough for their ticker, $ and %.
  const h = Math.round(w < 500 ? Math.min(420, w * 1.1) : Math.min(380, Math.max(300, w * 0.42)));
  const root = hierarchy<Node>(tree(board)).sum((d) => d.tile?.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const inGroup = (n: HierarchyRectangularNode<Node>) => (n.depth === 1 && n.children ? 3 : 0);
  const laid = treemap<Node>().tile(treemapSquarify.ratio(1.3)).size([w, h]).paddingInner(2).paddingOuter(0)
    .paddingTop((n) => (n.depth === 1 && n.children ? TITLE : 0)).paddingRight(inGroup).paddingBottom(inGroup).paddingLeft(inGroup).round(true)(root);
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
          {funds.map((f) => {
            const g = f.data.fund!, gw = f.x1 - f.x0, watch = g.state === "WATCH";
            return (
              <g key={f.data.name} pointerEvents="none">
                <rect x={f.x0 + 0.5} y={f.y0 + 0.5} width={gw - 1} height={f.y1 - f.y0 - 1} rx={8} fill="none"
                  stroke={watch ? "var(--gold)" : "var(--edge-c)"} strokeWidth={watch ? 1.5 : 1} />
                {gw > 70 && (
                  <text x={f.x0 + 10} y={f.y0 + 18} fontSize={13}>
                    <tspan fontWeight={700} fill={watch ? "var(--gold)" : "var(--text)"}>{g.symbol}</tspan>
                    {gw > 150 && <tspan fill="var(--text-2)"> · {money(g.value)} · {whole(g.value / total)}</tspan>}
                  </text>
                )}
                {watch && gw > 230 && <Badge x={f.x1 - 6} y={f.y0 + 4} />}
              </g>
            );
          })}
          {leaves.map((l) => {
            const t = l.data.tile!;
            const tw = l.x1 - l.x0, th = l.y1 - l.y0;
            const money$ = money(t.value), pct$ = whole(t.value / total), room = tw - 16;
            // ticker + $ + %: one line, else $ and % on two lines, else smaller type, else nothing (no bare tickers)
            const lines: string[] | null = !(tw >= LABEL_W && th >= LABEL_H) ? null
              : fits(`${money$} · ${pct$}`, 11, room) ? [`${money$} · ${pct$}`]
              : th >= 56 && fits(money$, 11, room) ? [money$, pct$]
              : fits(`${money$} · ${pct$}`, 10, room) ? [`${money$} · ${pct$}`] : null;
            const label = lines != null && fits(t.symbol, tw < 80 ? 11 : 13, room);
            const big = tw >= 120 && th >= 90; // centred, larger type, so a big tile doesn't read as empty
            const watch = t.state === "WATCH";
            const cx = l.x0 + tw / 2, cy = l.y0 + th / 2;
            const line2 = `${money$} · ${pct$}`;
            const body = (
              <g>
                <rect x={l.x0 + 0.5} y={l.y0 + 0.5} width={tw - 1} height={th - 1} rx={6} fill="var(--fill)"
                  stroke={watch ? "var(--gold)" : "var(--sep)"} strokeWidth={watch ? 1.5 : 1} />
                {label && big && <>
                  <text x={cx} y={cy - 2} textAnchor="middle" fontSize={18} fontWeight={700} fill={watch ? "var(--gold)" : "var(--text)"}>{t.symbol}</text>
                  <text x={cx} y={cy + 18} textAnchor="middle" fontSize={13} fill="var(--text-2)">{line2}</text>
                </>}
                {label && !big && <>
                  <text x={l.x0 + 8} y={l.y0 + 18} fontSize={tw < 80 ? 11 : 13} fontWeight={700} fill={watch ? "var(--gold)" : "var(--text)"}>{t.symbol}</text>
                  {lines!.map((ln, i) => (
                    <text key={i} x={l.x0 + 8} y={l.y0 + 34 + i * 14} fontSize={fits(ln, 11, room) ? 11 : 10} fill="var(--text-2)">{ln}</text>
                  ))}
                </>}
                {watch && tw >= 120 && th >= 48 && <Badge x={l.x1 - 6} y={l.y0 + 6} />}
                <title>{`${t.symbol} · ${t.name}${t.inside ? ` (inside ${t.inside})` : ""}: ${line2} of your investments${watch ? " · WATCH" : ""}`}</title>
              </g>
            );
            return t.href ? <Link key={t.key} href={t.href} aria-label={`${t.symbol}, ${money(t.value)}`}>{body}</Link> : <g key={t.key}>{body}</g>;
          })}
        </svg>
      </div>
      <p className="note">Same dollars as the list below, at the close. A stock you also own through a fund is one box with both parts.</p>
    </div>
  );
}
