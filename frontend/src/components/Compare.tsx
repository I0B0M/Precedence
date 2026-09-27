import type { SignalResult } from "@/lib/api";
import { liteVerdict } from "@/lib/words";

// Classic's answer to "has this mattered before?", with no legend: two rows of dots on the same count, one after the
// news and one in normal times, then one plain line. The row labels carry the meaning. Pro keeps the working.

const EVENT: Record<string, string> = {
  insider_cluster: "After insiders sold",
  rate_jump: "After a rate jump",
  market_rate_jump: "After a rate jump",
  gap_down: "After a 5% drop",
};

/** The question the rows answer. */
export function compareQuestion(s: SignalResult, ticker: string): string {
  if (s.signal === "insider_cluster") return `After insiders sold, did ${ticker} fall?`;
  if (s.signal === "market_rate_jump") return "When rates jumped, did the market fall?";
  if (s.signal === "rate_jump") return s.vs_market ? `When rates jumped, did ${ticker} lag the market?` : `When rates jumped, did ${ticker} fall?`;
  if (s.signal === "gap_down") return `After a 5% drop at the open, did ${ticker} keep falling?`;
  return `Did ${ticker} fall after this?`;
}

/** "Twice as often as usual." from the hit rate against the normal rate. */
function ratioWords(hit: number | null, normal: number | null): string | null {
  if (hit == null || normal == null || normal <= 0) return null;
  const r = hit / normal;
  if (r >= 1.8) return "Twice as often as usual.";
  if (r >= 1.2) return "More often than usual.";
  if (r > 0.8) return "About the same as usual.";
  return "Less often than usual.";
}

function Dots({ n, filled, tone }: { n: number; filled: number; tone: "event" | "normal" }) {
  return (
    <span className="cmp-dots" aria-hidden>
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < filled ? tone : undefined} />)}
    </span>
  );
}

export function Compare({ s, ticker }: { s: SignalResult; ticker: string }) {
  if (s.label === "NO DATA") return <p>{s.note ?? "Not tested yet."}</p>;
  if (s.n === 0) return <p>This hasn&apos;t happened to {ticker} in two years.</p>;
  const usual = s.normal_rate != null ? Math.round(s.normal_rate * s.n) : null;
  const period = s.horizon === 5 ? "week" : s.horizon === 20 ? "month" : `${s.horizon} days`;
  const answer = s.label === "WEAK" ? null : ratioWords(s.hit_rate, s.normal_rate);
  return (
    <div className="cmp">
      <p className="cmp-q">{compareQuestion(s, ticker)}</p>
      <div className="cmp-row" aria-label={`${EVENT[s.signal] ?? "After this"}: ${s.hits} of ${s.n}`}>
        <span className="cmp-label">{EVENT[s.signal] ?? "After this"}</span>
        <Dots n={s.n} filled={s.hits} tone="event" />
        <span className="cmp-count">{s.hits} of {s.n}</span>
      </div>
      {usual != null && (
        <div className="cmp-row" aria-label={`In a normal ${period}: about ${usual} of ${s.n}`}>
          <span className="cmp-label">In a normal {period}</span>
          <Dots n={s.n} filled={usual} tone="normal" />
          <span className="cmp-count">about {usual} of {s.n}</span>
        </div>
      )}
      <p className="cmp-a"><b>{answer ? `${answer} ` : ""}{liteVerdict(s, ticker)}</b></p>
    </div>
  );
}
