import type { Label, Scan, SignalResult, State } from "@/lib/api";
import { whole } from "@/lib/format";

/** CALM / WATCH. A fund or stock the engine hasn't tested gets a quiet "Not tested", never "Calm". */
export function StateBadge({ state }: { state: State | null }) {
  if (state == null) return <span className="badge untested">Not tested</span>;
  return (
    <span className={`badge ${state === "WATCH" ? "watch" : "calm"}`}>
      <span className="lite-only">{state === "WATCH" ? "Heads up" : "Calm"}</span>
      <span className="pro-only">{state}</span>
    </span>
  );
}

export function LabelTag({ label }: { label: Label }) {
  return <span className={`label ${label.toLowerCase().replace(" ", "")}`}>{label}</span>;
}

/** One dot per past case; filled = the stock was lower afterwards (or, vsMarket, did worse than SPY). */
export function HitDots({ cases, vsMarket = false }: { cases: { hit: boolean }[]; vsMarket?: boolean }) {
  if (!cases.length) return null;
  const what = vsMarket ? "did worse than the market" : "were lower";
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="hitdots" role="img" aria-label={`${cases.filter((c) => c.hit).length} of ${cases.length} ${what}`}>
        {cases.map((c, i) => <i key={i} className={c.hit ? "h" : undefined} style={{ "--i": i } as React.CSSProperties} />)}
      </div>
      <p className="note dotkey" aria-hidden>
        <span><i className="h" /> {vsMarket ? "did worse than the market" : "was lower after"}</span>
        <span><i /> didn&apos;t</span>
      </p>
    </div>
  );
}

/** Pro: whether a STRONG result held up on each half of the history. */
export function HoldoutNote({ s }: { s: SignalResult }) {
  if (!s.holdout) return <span className="mute">—</span>;
  const { first, second, held_up } = s.holdout;
  return (
    <span>
      <b>{held_up ? "held up" : "did not hold"}</b>
      <span className="note" style={{ display: "block" }}>1st half {first.n} cases {whole(first.hit_rate)} vs {whole(first.normal_rate)} ·
        2nd half {second.n} cases {whole(second.hit_rate)} vs {whole(second.normal_rate)}</span>
    </span>
  );
}

/** Pro: how many pairs the latest scan tested, so a STRONG can be judged against luck. */
export function ScanLine({ scan }: { scan: Scan | null }) {
  if (!scan) return <p className="note">No full scan recorded yet.</p>;
  return (
    <p className="note">
      Latest scan ({scan.as_of}): tested {scan.tested} stock-signal pairs across {scan.stocks} stocks;
      {" "}{scan.eligible} had 10+ cases; {scan.strong} came out STRONG, about {Math.round(scan.expected_by_chance)} expected
      by chance alone; {scan.strong_held_up} of those held up in both halves of the history.
    </p>
  );
}
