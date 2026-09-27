"use client";

import { useState } from "react";
import { api, ApiError, type FilingSummary as FilingSummaryData } from "@/lib/api";
import { shortDate } from "@/lib/format";

type Got = { kind: "ok"; s: FilingSummaryData } | { kind: "soon" } | { kind: "none" } | { kind: "down" };

async function fetchSummary(accession: string): Promise<Got> {
  try {
    return { kind: "ok", s: await api.filingSummary(accession) };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    if (status === 503) return { kind: "soon" }; // no Gemini key yet
    if (status === 404) return { kind: "none" };
    return { kind: "down" };
  }
}

const bigNum = (v: number | null) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(0)}M` : a.toLocaleString("en-US");
  return (v < 0 ? "−$" : "$") + s;
};

/** "Read it in plain words" for one filing: Gemini's summary, with each figure checked against the SEC's XBRL numbers. */
export function FilingSummary({ accession }: { accession: string }) {
  const [open, setOpen] = useState(false);
  const [got, setGot] = useState<Got | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !got) fetchSummary(accession).then(setGot);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button type="button" className="linkb" aria-expanded={open} onClick={toggle}>
        {open ? "Hide the summary" : "Read it in plain words"}
      </button>
      {open && (
        <div role="region" aria-label="Filing summary"
          style={{ border: "1.5px dashed var(--edge-c)", borderRadius: "var(--r-ctl)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
          {!got ? <p className="note">Reading the filing…</p>
            : got.kind === "soon" ? <p className="mute">Summary coming soon.</p>
            : got.kind === "none" ? <p className="mute">There&apos;s no summary for this filing yet.</p>
            : got.kind === "down" ? <p className="mute">Precedence can&apos;t reach its data right now, so there&apos;s no summary to show.</p>
            : (
              <>
                <p>{got.s.summary_lite}</p>
                {got.s.figures.length > 0 && (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {got.s.figures.map((f, i) => (
                      <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span className={f.match === true ? "up" : f.match === false ? "down" : "mute"} style={{ fontWeight: 700, width: 16, flex: "none", textAlign: "center" }}
                          aria-label={f.match === true ? "matches the SEC's numbers" : f.match === false ? "doesn't match the SEC's numbers" : "not checked"}>
                          {f.match === true ? "✓" : f.match === false ? "≠" : "–"}
                        </span>
                        <span>
                          <b>{f.label}</b>: {f.text_value}
                          <span className="note" style={{ display: "block" }}>
                            SEC filing: {bigNum(f.xbrl_value)}{f.period_end ? `, period ending ${shortDate(f.period_end)}` : ""}
                            <span className="pro-only">{f.concept ? ` · ${f.concept}` : ""}</span>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="note">
                  Written by {got.s.model.toLowerCase().includes("gemini") ? "Gemini" : got.s.model}, numbers checked against the SEC filing
                  {got.s.generated_at ? ` · ${shortDate(got.s.generated_at)}` : ""}. ✓ matches the SEC&apos;s numbers; ≠ doesn&apos;t.
                </p>
              </>
            )}
        </div>
      )}
    </div>
  );
}
