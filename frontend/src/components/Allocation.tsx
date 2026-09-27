import type { PortfolioOut } from "@/lib/api";
import { approxMoney, money, sharePct as share } from "@/lib/format";

// Categorical order is fixed: stocks, funds, 401(k)/IRA, home. Checked with the dataviz palette validator on the dark
// surface (#0b0b0c): lightness band, chroma, contrast and normal-vision separation pass; plum next to blue is 7.7 ΔE for
// protan vision, legal only with secondary encoding, which the 2px gaps and the named legend rows give.
const PARTS = [
  { key: "stocks", label: "Stocks", color: "#b68b16" },
  { key: "funds", label: "Funds", color: "#2c5dbd" },
  { key: "retirement", label: "401(k) and IRA", color: "#94468f" },
  { key: "home", label: "Home (estimate)", color: "#00a4c0" },
] as const;

/** Everything you own, split four ways, as one bar. Shown when at least two parts have money in them. */
export function Allocation({ board }: { board: PortfolioOut }) {
  const sum = (kind: string) => board.rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.value, 0);
  const value: Record<(typeof PARTS)[number]["key"], number> = {
    stocks: sum("stock"),
    funds: sum("etf"),
    retirement: board.subtotals?.retirement ?? 0,
    home: board.subtotals?.home_estimate ?? 0,
  };
  const total = PARTS.reduce((a, p) => a + value[p.key], 0);
  const parts = PARTS.filter((p) => value[p.key] > 0);
  const dollars = (k: string) => (k === "home" ? `About ${approxMoney(value.home)}` : money(value[k as keyof typeof value]));
  if (parts.length < 2 || total <= 0) return null;

  return (
    <div className="alloc-wrap">
      <div className="alloc" role="img"
        aria-label={`What you own: ${parts.map((p) => `${p.label} ${dollars(p.key)}, ${share(value[p.key] / total)}`).join("; ")}`}>
        {parts.map((p) => (
          <span key={p.key} className="alloc-seg" title={`${p.label}: ${dollars(p.key)} (${share(value[p.key] / total)})`}
            style={{ flexGrow: value[p.key], background: p.color }} />
        ))}
      </div>
      <ul className="alloc-key">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} aria-hidden />
            <span>{p.label}</span>
            <b>{dollars(p.key)}</b>
            <span className="mute">{share(value[p.key] / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
