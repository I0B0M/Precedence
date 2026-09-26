import type { Label, State } from "@/lib/api";

export function StateBadge({ state }: { state: State }) {
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

/** One dot per past case; filled = the stock was lower afterwards. */
export function HitDots({ cases }: { cases: { hit: boolean }[] }) {
  if (!cases.length) return null;
  return (
    <div className="hitdots" role="img" aria-label={`${cases.filter((c) => c.hit).length} of ${cases.length} were lower`}>
      {cases.map((c, i) => <i key={i} className={c.hit ? "h" : undefined} />)}
    </div>
  );
}
