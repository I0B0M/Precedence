"use client";

import { useId, useState } from "react";
import type { Scan, SignalResult } from "@/lib/api";
import { shortDate, whole } from "@/lib/format";
import { splitGap } from "@/lib/words";

/** What <Why/> can explain. Pass whatever you have; each part shows only if present. */
export interface WhyProps {
  signal?: SignalResult; // cases, hit rate, normal rate, 90% range, verdict, hold-out
  scan?: Scan | null; // the scan-wide multiple-testing check
  source?: string; // e.g. "SEC EDGAR · Alpaca IEX prices · FRED DGS10"
  asOf?: string | null; // ISO date or datetime
  filings?: { label: string; url: string | null }[];
  rows?: [string, string][]; // extra working for numbers that aren't signals, e.g. ["Weight", "8.19% of the fund"]
  what?: string; // what the number is, for the button's accessible name, e.g. "BX rate jump"
}

const holdoutWords = (h: NonNullable<SignalResult["holdout"]>) =>
  h.verdict ?? (h.held_up === true ? "held up" : h.held_up === false ? "did not hold" : "too few cases to check");

/** A small "Why?" next to a number. Pro only: opens the working behind that number. Hidden in Lite. */
export function Why({ signal: s, scan, source, asOf, filings, rows, what }: WhyProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const lines: [string, string][] = [];

  if (s) {
    if (s.label === "NO DATA") {
      lines.push(["Not tested", s.note ?? "The source data isn't loaded yet."]);
    } else {
      lines.push(["Cases", `${s.n} in about two years of daily prices`]);
      if (s.n) lines.push(["Came true", `${s.hits} of ${s.n} (${whole(s.hit_rate)}), ${s.vs_market ? "did worse than SPY" : "was lower"} after ${s.horizon} trading days`]);
      // Normal days are start days whose whole window touches no event, so a stock with frequent events has fewer of them.
      lines.push(["Normal rate", `${whole(s.normal_rate)} of ${s.normal_n} ordinary days, measured the same way. An ordinary day is one whose whole ${s.horizon}-trading-day window touches no event, so frequent events leave fewer of them`]);
      if (s.n) lines.push(["90% range", `${whole(s.low)}–${whole(s.high)} (Wilson)`]);
      lines.push(["Verdict", `${s.label}: STRONG only if the whole range beats the normal rate; under 10 cases is WEAK`]);
      if (s.holdout) {
        const h = s.holdout;
        lines.push(["Hold-out", `${holdoutWords(h)} (1st half ${h.first.n} cases ${whole(h.first.hit_rate)} vs ${whole(h.first.normal_rate)}; 2nd half ${h.second.n} cases ${whole(h.second.hit_rate)} vs ${whole(h.second.normal_rate)})${splitGap(s)}`]);
      }
      // null means this result wasn't in the scan's correction (under 10 cases, a fund or the market card): say that, not "no".
      if (s.fdr10_survives != null) {
        lines.push(["Survives the correction", `${s.fdr10_survives ? "yes" : "no"}: Benjamini–Hochberg at a 10% false-discovery rate, across every stock-signal pair in the latest scan`]);
      } else if (s.fdr10_survives === null && s.n >= 10) {
        lines.push(["Survives the correction", "not part of the latest scan's correction"]);
      }
      if (s.firing) lines.push(["Firing now", `${s.firing.note} (known ${shortDate(s.firing.known_at)})`]);
    }
  }
  if (scan && scan.strong_fdr10 != null) {
    lines.push(["Correction", `Across all ${scan.tested} stock-signal tests (${shortDate(scan.as_of)}), ${scan.strong_fdr10} of ${scan.strong} STRONG results survive a 10% false-discovery correction. Precedence doesn't report this per signal yet.`]);
  }
  for (const r of rows ?? []) lines.push(r);
  if (source || asOf) lines.push(["Source", [source, asOf ? `as of ${shortDate(asOf)}` : null].filter(Boolean).join(", ")]);

  if (!lines.length && !filings?.length) return null;
  return (
    <span className="pro-only why">
      <button type="button" className="linkb" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        aria-label={`Why${what ? `: ${what}` : ""}`} style={{ fontSize: 13, padding: "2px 6px", minHeight: 44, minWidth: 44, textDecoration: "underline", textUnderlineOffset: 3 }}>
        Why?
      </button>
      {open && (
        <span id={id} role="region" aria-label={`The working${what ? ` for ${what}` : ""}`}
          style={{ display: "block", marginTop: 6, padding: "10px 12px", border: "1px solid var(--sep)", borderRadius: "var(--r-ctl)", background: "var(--raised)", fontSize: 13, lineHeight: 1.45, textAlign: "left", whiteSpace: "normal", maxWidth: 520 }}>
          {lines.map(([k, v]) => (
            <span key={k} style={{ display: "block", padding: "2px 0" }}><b>{k}:</b> <span className="mute">{v}</span></span>
          ))}
          {filings && filings.length > 0 && (
            <span style={{ display: "block", paddingTop: 4 }}>
              <b>Filings:</b>{" "}
              {filings.map((f, i) => (
                <span key={i}>{i > 0 && " · "}{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.label}</a> : f.label}</span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
