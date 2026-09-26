"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { api, type CompanyDetail, type ExposureRow } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { useMode } from "@/lib/mode";

const DAYS = 30; // trading days

export function Spark({ closes }: { closes: number[] }) {
  if (closes.length < 2) return <span className="spark" />;
  const W = 96, H = 28, lo = Math.min(...closes), hi = Math.max(...closes), r = hi - lo || 1;
  const d = closes.map((c, i) => `${i ? "L" : "M"}${((i / (closes.length - 1)) * W).toFixed(1)},${(H - 2 - ((c - lo) / r) * (H - 4)).toFixed(1)}`).join("");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Pro only: one line per holding you own directly, with its last 30 trading days. Uses the company endpoint's prices. */
export function HoldingsRail({ rows }: { rows: ExposureRow[] }) {
  const { mode } = useMode();
  const direct = rows.filter((e) => e.direct > 0);
  const key = direct.map((e) => e.symbol).join(",");
  const [got, setGot] = useState<{ key: string; data: Record<string, CompanyDetail> } | null>(null);

  useEffect(() => {
    if (mode !== "pro" || !key) return;
    Promise.all(key.split(",").map((t) => api.company(t).then((d) => [t, d] as const).catch(() => null)))
      .then((pairs) => setGot({ key, data: Object.fromEntries(pairs.filter((p): p is readonly [string, CompanyDetail] => p !== null)) }));
  }, [mode, key]);

  if (mode !== "pro" || !direct.length) return null;
  const data = got?.key === key ? got.data : null;
  const asOf = data ? Object.values(data)[0]?.last?.day : null;

  return (
    <div className="rail pro-only">
      <span className="ticker">Holdings, last {DAYS} trading days</span>
      {!data ? <p className="note">Loading prices…</p> : (
        <div className="rail-rows">
          {direct.map((e) => {
            const d = data[e.symbol];
            const closes = d?.prices.slice(-DAYS).map((p) => p.close) ?? [];
            const chg = closes.length > 1 ? closes[closes.length - 1] / closes[0] - 1 : null;
            return (
              <Link key={e.symbol} href={`/company/${e.symbol}`} className="rail-row">
                <b>{e.symbol}</b>
                <span className={chg != null && chg < 0 ? "down" : "up"}><Spark closes={closes} /></span>
                <span className="num">{d?.last ? money(d.last.close, true) : "—"}</span>
                <span className={`num ${chg != null && chg < 0 ? "down" : "up"}`}>{chg != null ? pct(chg) : "—"}</span>
                <StateBadge state={e.state} />
              </Link>
            );
          })}
        </div>
      )}
      {asOf && <p className="note">Daily closes to {shortDate(asOf)}, from Stone&apos;s price data.</p>}
    </div>
  );
}
