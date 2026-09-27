"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type FilingSummary as FilingSummaryData } from "@/lib/api";
import { features } from "@/lib/features";
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

// Asked once per page load: does the summary service answer at all? A 503 means it isn't connected (no key),
// so no filing shows a button that could only say "not available". Summaries are cached by the API, so this is cheap.
let service: Promise<boolean> | null = null;
function serviceOn(accession: string): Promise<boolean> {
  // status.summaries answers without a call; an older API doesn't send it, so then ask the endpoint once (503 = off).
  service ??= features().then((f) => f.summaries ?? api.filingSummary(accession).then(() => true, (e) => !(e instanceof ApiError && e.status === 503)));
  return service;
}

const bigNum = (v: number | null) => {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(0)}M` : a.toLocaleString("en-US");
  return (v < 0 ? "−$" : "$") + s;
};

/** "Read it in plain words" for one filing (hidden while the summary service is off): Gemini's summary, with each figure checked against the SEC's XBRL numbers. */
export function FilingSummary({ accession }: { accession: string }) {
  const [open, setOpen] = useState(false);
  const [got, setGot] = useState<Got | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    serviceOn(accession).then((v) => live && setOn(v));
    return () => { live = false; };
  }, [accession]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !got) fetchSummary(accession).then((g) => {
      setGot(g);
      if (g.kind === "soon") setOn(false); // the service went away mid-session: hide the control, same as never having it
    });
  }

  if (!on) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button type="button" className="linkb" aria-expanded={open} onClick={toggle}>
        {open ? "Hide the summary" : "Read it in plain words"}
      </button>
      {open && got?.kind !== "soon" && (
        <div role="region" aria-label="Filing summary"
          style={{ border: "1.5px dashed var(--edge-c)", borderRadius: "var(--r-ctl)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
          {!got ? <p className="note">Reading the filing…</p>
            : got.kind === "none" ? <p className="mute">No summary for this filing yet.</p>
            : got.kind === "down" ? <p className="mute">Can&apos;t load the summary right now.</p>
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
                  By {got.s.model.toLowerCase().includes("gemini") ? "Gemini" : got.s.model}{got.s.generated_at ? `, ${shortDate(got.s.generated_at)}` : ""} · ✓ matches the SEC filing · ≠ doesn&apos;t
                </p>
              </>
            )}
        </div>
      )}
    </div>
  );
}
