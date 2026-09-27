"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Label, Scan, SignalResult, State } from "@/lib/api";
import { whole } from "@/lib/format";
import { proCaveat, splitGap } from "@/lib/words";

const BADGE_TIPS = {
  WATCH: "Has come before drops. Not a prediction.",
  CALM: "Nothing with a track record is happening.",
  UNTESTED: "Not tested yet.",
} as const;

/** CALM / WATCH, with a tiny tooltip on hover, tap or focus. A fund or stock the engine hasn't tested gets a quiet
 *  "Not tested", never "Calm" — Pro only; Lite shows no badge at all for an untested row. Inside a row that is
 *  already a link or button, the badge isn't focusable itself (no nested controls); the title still carries the
 *  tip there. */
export function StateBadge({ state }: { state: State | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const tip = BADGE_TIPS[state ?? "UNTESTED"];

  useEffect(() => {
    const el = ref.current;
    if (el && !el.parentElement?.closest("a, button")) el.tabIndex = 0;
  }, []);

  return (
    <span ref={ref} className={`badge ${state == null ? "untested pro-only" : state === "WATCH" ? "watch" : "calm"}`}
      title={tip} aria-describedby={open ? id : undefined} style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      {state == null ? "Not tested" : (
        <>
          <span className="lite-only">{state === "WATCH" ? "Heads up" : "Calm"}</span>
          <span className="pro-only">{state}</span>
        </>
      )}
      {open && (
        <span role="tooltip" id={id}
          style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 20, whiteSpace: "nowrap", pointerEvents: "none",
            background: "var(--text)", color: "var(--bg)", fontSize: 12, fontWeight: 500, padding: "4px 8px", borderRadius: 6 }}>
          {tip}
        </span>
      )}
    </span>
  );
}

/** Pro only: one line mapping WATCH / CALM to Lite's words. Lite shows no key; the badge's own tooltip explains it. */
export function BadgeKey() {
  return (
    <p className="note badge-key pro-only">
      WATCH: a result that came out STRONG on this stock&apos;s past is happening again. It describes the past, not a prediction.
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

/** The verdict tag, and in Pro beside a STRONG one, what the stricter checks say ("Doesn't survive the correction"). */
export function Verdict({ s }: { s: { label: Label; fdr10_survives?: boolean | null; holdout?: SignalResult["holdout"]; strict?: SignalResult["strict"] } }) {
  const c = proCaveat(s);
  // A small column, tag on top and the caveat under it, so the two never run into each other on a narrow screen.
  return (
    <span className="verdict">
      <LabelTag label={s.label} />
      {c && <span className="note caveat pro-only">{c}</span>}
    </span>
  );
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
        <span><i className="h" /> {vsMarket ? "worse than the market" : "lower after"}</span>
        <span><i /> {vsMarket ? "not worse" : "not lower"}</span>
      </p>
    </div>
  );
}

/** Pro: whether a STRONG result held up on each half of the history. */
export function HoldoutNote({ s }: { s: SignalResult }) {
  if (!s.holdout) return <span className="mute">—</span>;
  // Say only what the backend says: its verdict ("held up" / "did not hold" / "too few cases to check"),
  // else "held up" / "did not hold" only for an explicit true / false.
  const h = s.holdout as NonNullable<SignalResult["holdout"]> & { label?: string | null; held_up: boolean | null };
  const { first, second } = h;
  const verdict = h.verdict ?? h.label
    ?? (h.held_up === true ? "held up" : h.held_up === false ? "did not hold" : "too few cases to check");
  return (
    <span>
      <b>{verdict}</b>
      <span className="note" style={{ display: "block" }}>1st half {first.n} cases {whole(first.hit_rate)} vs {whole(first.normal_rate)} ·
        2nd half {second.n} cases {whole(second.hit_rate)} vs {whole(second.normal_rate)}{splitGap(s)}</span>
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
      by chance alone; {scan.strong_held_up} of those held up in both halves of the history (10+ cases in each).
      {scan.strong_fdr10 != null && <> Corrected for testing {scan.eligible} pairs at once (Benjamini–Hochberg, 10% false
        discovery rate), {scan.strong_fdr10} still stand.</>}
    </p>
  );
}
