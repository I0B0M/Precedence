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

/** What the badge means, in both modes, so Heads up and WATCH (Calm and CALM) are clearly the same thing. */
export function BadgeKey() {
  return (
    <p className="note badge-key">
      <span className="lite-only">
        <b>Heads up</b> = this has happened more often than usual after news like this, not that it&apos;s likely.{" "}
        <b>Calm</b> = nothing that has mattered before is happening.
      </span>
      <span className="pro-only">
        <b>WATCH</b> (Lite: Heads up) = a STRONG signal for this stock is firing now. <b>CALM</b> (Lite: Calm) = none is.
      </span>
    </p>
  );
}

export function LabelTag({ label }: { label: Label }) {
  // NO DATA: the source data isn't loaded, so nothing was tested. A neutral tag, never a verdict.
  if (label === "NO DATA") {
    return <span className="label nodata" title="Source data not loaded yet, so this wasn't tested"
      style={{ borderColor: "var(--sep)", color: "var(--text-2)", fontWeight: 500 }}>Not loaded</span>;
  }
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
  // Say only what the backend says: its own label if it sends one (e.g. "too few cases to check"),
  // "held up" / "did not hold" only for an explicit true / false, and no verdict otherwise.
  const h = s.holdout as NonNullable<SignalResult["holdout"]> & { label?: string | null; held_up: boolean | null };
  const { first, second } = h;
  const verdict = h.label ? h.label : h.held_up === true ? "held up" : h.held_up === false ? "did not hold" : "too few cases to check";
  return (
    <span>
      <b>{verdict}</b>
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
