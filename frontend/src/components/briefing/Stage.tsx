"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, SAVED, SAVED_EXAMPLE, type Holding, type PortfolioOut, type PortfolioRisk, type Status } from "@/lib/api";
import { createNarrator, hasAudio, hasVoice, pickVoice, type Narrator } from "@/lib/briefing/narrator";
import { loadRecordings, type Recordings } from "@/lib/briefing/recordings";
import { loadScript } from "@/lib/briefing/source";
import { wordsReached } from "@/lib/briefing/spoken";
import type { Line, Script } from "@/lib/briefing/types";
import { money, pct, shortDate } from "@/lib/format";
import { NO_HOLDINGS, SAMPLE_PORTFOLIO, useHoldings } from "@/lib/holdings";
import "@/app/briefing/briefing.css";
import { portfolioExtras, useOtherAssets } from "@/lib/other-assets";
import { useMode } from "@/lib/mode";
import { SIGNAL_WORDS } from "@/lib/words";
import type { OrbState } from "./orb/palette";

// three.js needs a window; the orb only ever renders in the browser.
const Orb = dynamic(() => import("./orb/Orb").then((m) => m.Orb), { ssr: false });

type Phase = "loading" | "no-holdings" | "ready" | "error";
type PlayStatus = "idle" | "playing" | "paused" | "done";

interface Loaded {
  key: string;
  portfolio: PortfolioOut;
  risk: PortfolioRisk | null;
  script: Script;
  /** The recorded voice, by `say`; empty when the site has none. */
  recordings: Recordings;
}

// Fetched once per visit: the recordings don't depend on the holdings.
let recordingsOnce: Promise<Recordings> | null = null;

/** A cite string ("signal:insider_cluster") as a chip: words and where the working is. */
function citeChip(cite: string, line: Line): { label: string; href: string } | null {
  const [kind, rest] = cite.split(":", 2);
  const t = line.ticker;
  switch (kind) {
    case "signal": return { label: SIGNAL_WORDS[rest] ?? rest, href: t ? `/lab?t=${t}&s=${rest}` : "/lab" };
    case "market": return { label: "Rate jump · whole market", href: "/company/SPY" };
    case "risk": return { label: `Risk card · ${rest.replace(/_/g, " ")}`, href: "/#risk" };
    case "price": return { label: `Prices · ${shortDate(rest)}`, href: t ? `/company/${t}` : "/" };
    case "filing": return { label: "Filing", href: t ? `/company/${t}` : "/" };
    case "fact": return { label: `Filing figure · ${rest.replace(/_/g, " ")}`, href: t ? `/company/${t}` : "/" };
    case "fund": return { label: `Inside ${rest}`, href: `/fund/${rest}` };
    case "rate": return { label: `10-year yield · ${shortDate(rest)}`, href: "/company/SPY" };
    case "portfolio": return { label: rest === "exposure" ? "What you really own" : "The board", href: "/" };
    default: return null;
  }
}

const stateWords = (s: "CALM" | "WATCH" | null) => (s === "WATCH" ? "Heads up" : s === "CALM" ? "Calm" : "Not tested");

// The browser's voice list often arrives a moment after the page; the name shown follows it.
function subscribeVoices(cb: () => void) {
  if (!hasVoice()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}
const readVoiceName = () => (hasVoice() ? pickVoice(window.speechSynthesis.getVoices())?.name ?? null : null);

/** Brief: "summarize complex information" · "more accessible … engaging" · "understanding what they own". */
const PHONE = "(max-width: 767px)";
function subscribePhone(cb: () => void) {
  const m = window.matchMedia?.(PHONE);
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
}
const readPhone = () => !!window.matchMedia?.(PHONE).matches;

/** fallback: what to brief on when nothing is saved (the landing passes the example). Saved holdings always win.
 *  compact: the landing hero's strip, the orb as centrepiece with the caption and Play under it, the full
 *  briefing one link away. onFocusChange: which ticker (if any) the current line is about — the landing uses
 *  this to light up its own chips; nothing here needs it, so it's a no-op unless a caller passes one. */
export function Stage({ fallback, compact = false, onFocusChange }: { fallback?: Holding[]; compact?: boolean; onFocusChange?: (ticker: string | null) => void } = {}) {
  const { mode } = useMode();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [holdings] = useHoldings(status ? (status.data === "sample" ? SAMPLE_PORTFOLIO : SAVED ? SAVED_EXAMPLE : fallback ?? NO_HOLDINGS) : null);

  // Where the narration is, tied to the script it belongs to: a new script starts idle at line 0.
  const [pos, setPos] = useState<{ script: Script | null; play: PlayStatus; index: number; fraction: number; level: number }>(
    { script: null, play: "idle", index: 0, fraction: 0, level: 0 });
  const [voiceOn, setVoiceOn] = useState(true);
  const [browserVoice] = useState(() => hasVoice()); // read on the client; the controls only render after data arrives
  const voiceName = useSyncExternalStore(subscribeVoices, readVoiceName, () => null);
  const phone = useSyncExternalStore(subscribePhone, readPhone, () => false); // under 768px: a smaller orb, the first line up top
  const narrator = useRef<Narrator | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(setError);
  }, []);

  // The board, the risk card and the script, for these holdings. A stale answer (holdings changed
  // meanwhile) is ignored by its key.
  // The home, 401(k)/IRA and private funds too, as /portfolio sends them, so the Briefing's total is the board's.
  const other = useOtherAssets();
  const extras = JSON.stringify(portfolioExtras(other));
  const key = holdings ? JSON.stringify([holdings, extras]) : null;
  useEffect(() => {
    if (!key) return;
    const [h, extra] = JSON.parse(key) as [Holding[], string];
    if (!h.length) return;
    const ex = JSON.parse(extra) as ReturnType<typeof portfolioExtras>;
    let live = true;
    (async () => {
      try {
        const [portfolio, risk, recordings] = await Promise.all([
          api.portfolio(h, ex), api.risk(h).catch(() => null), (recordingsOnce ??= loadRecordings()),
        ]);
        const script = await loadScript(h, portfolio, risk, ex);
        if (live) setLoaded({ key, portfolio, risk, script, recordings });
      } catch (e) {
        if (live) setError(e);
      }
    })();
    return () => { live = false; };
  }, [key]);

  const script = loaded?.key === key ? loaded.script : null;
  const recordings = loaded?.key === key ? loaded.recordings : null;
  const lines = useMemo(() => script?.lines ?? [], [script]);
  // Each line with its recording, when the site has one for exactly these words.
  const spoken = useMemo(() => lines.map((l) => ({ say: l.say, recording: recordings?.get(l.say) ?? null })), [lines, recordings]);
  const recorded = spoken.filter((l) => l.recording).length;

  // One narrator per script. Destroying it cancels any speech, so leaving the page goes quiet.
  useEffect(() => {
    if (!script || !spoken.length) return;
    const n = createNarrator(spoken, {
      onLine: (i) => setPos((p) => ({ ...p, script, index: i, fraction: 0 })),
      // A recording says how loud it is; the browser's voice doesn't, so the orb keeps a speaking rhythm.
      onProgress: (i, f, lv) => setPos((p) => ({ ...p, script, index: i, fraction: f, level: lv ?? 0.55 + 0.45 * Math.abs(Math.sin(f * 37)) })),
      onStatus: (st) => setPos((p) => ({ ...p, script, play: st })),
    }, { voice: voiceOn });
    narrator.current = n;
    return () => {
      n.destroy();
      if (narrator.current === n) narrator.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, spoken]);

  useEffect(() => { narrator.current?.setVoice(voiceOn); }, [voiceOn]);

  // Space plays or pauses, the right arrow skips, R restarts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") { e.preventDefault(); narrator.current?.toggle(); }
      else if (e.key === "ArrowRight") narrator.current?.next();
      else if (e.key.toLowerCase() === "r") narrator.current?.restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const phase: Phase = error ? "error" : holdings && !holdings.length ? "no-holdings" : script ? "ready" : "loading";
  const current = pos.script === script && script ? pos : { play: "idle" as PlayStatus, index: 0, fraction: 0, level: 0 };
  const { play, index: lineIndex, fraction, level } = current;
  const line = lines[lineIndex] ?? null;
  const focusTicker = play !== "idle" ? line?.ticker ?? null : null;
  useEffect(() => {
    onFocusChange?.(focusTicker);
    return () => onFocusChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTicker]);
  const canSpeak = browserVoice || (recorded > 0 && hasAudio());
  const voiceTitle = !canSpeak ? "This browser has no voice; captions only"
    : spoken[lineIndex]?.recording ? "Voice: Kokoro, an open-weight speech model, recorded ahead of time"
    : voiceName ? `Voice: ${voiceName} (this browser's)` : "Voice";

  const orbState = useMemo<OrbState>(() => {
    if (phase === "error") return { state: "failed" };
    if (phase === "no-holdings") return { state: "needs" };
    if (phase === "loading") return { state: "thinking" };
    if (play === "playing") return { state: "speaking", tint: line?.tone ?? "calm", level };
    if (play === "paused") return { state: "paused" };
    return { state: "idle" };
  }, [phase, play, line, level]);

  const onJump = useCallback((i: number) => narrator.current?.play(i), []);

  const caption = line ? (mode === "pro" && line.pro ? line.pro : line.text) : "";
  const words = caption.split(/\s+/).filter(Boolean);
  const reached = play === "done" && lineIndex === lines.length - 1 ? words.length : wordsReached(caption, fraction);

  const focus = line?.ticker && loaded?.key === key
    ? { row: loaded.portfolio.rows.find((r) => r.symbol === line.ticker) ?? null, exp: loaded.portfolio.exposure.find((e) => e.symbol === line.ticker) ?? null }
    : null;

  return (
    <section className={`bf${compact ? " bf-compact" : ""}`} data-phase={phase} data-play={play}>
      <div className="bf-stage">
        <div className="bf-glow" aria-hidden />
        <div className="bf-orbwrap">
          <Orb state={orbState} size={compact ? (phone ? 200 : 340) : phone ? 150 : 340} big={compact} />
        </div>

        <div className="bf-caption" aria-live="polite" aria-atomic="true">
          {phase === "loading" && <p className="bf-cap dim">Reading what you own…</p>}
          {phase === "error" && (
            <p className="bf-cap dim">Precedence can&apos;t reach its data right now. <button type="button" className="bf-link" onClick={() => window.location.reload()}>Try again</button></p>
          )}
          {phase === "no-holdings" && (
            <p className="bf-cap dim">Nothing to brief you on yet. <Link className="bf-link" href="/import">Add what you own</Link> and come back.</p>
          )}
          {phase === "ready" && play === "idle" && (
            phone && !compact && lines[0]
              // On a phone the first line itself, so a number shows without scrolling.
              ? <p className="bf-cap dim">{mode === "pro" && lines[0].pro ? lines[0].pro : lines[0].text} Press play.</p>
              : <p className="bf-cap dim">{lines.length} things to say about what you own{script?.as_of ? `, at the close on ${shortDate(script.as_of)}` : ""}. Press play.</p>
          )}
          {phase === "ready" && play !== "idle" && line && (
            <p className={`bf-cap tone-${line.tone}`}>
              {words.map((w, i) => (
                <span key={i} className={i < reached ? "on" : undefined}>{w}{" "}</span>
              ))}
            </p>
          )}
        </div>

        {phase === "ready" && (
          <div className="bf-controls" role="group" aria-label="Playback">
            <button type="button" className="bf-btn primary" onClick={() => narrator.current?.toggle()} aria-label={play === "playing" ? "Pause" : "Play the briefing"}>
              {play === "playing" ? "Pause" : play === "paused" ? "Resume" : play === "done" ? "Play again" : "Play the briefing"}
            </button>
            {!compact && <>
              <button type="button" className="bf-btn" onClick={() => narrator.current?.next()} disabled={play === "idle" || lineIndex >= lines.length - 1}>Next</button>
              <button type="button" className="bf-btn" onClick={() => narrator.current?.restart()} disabled={play === "idle"}>Restart</button>
            </>}
            <button type="button" className="bf-btn" onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn} disabled={!canSpeak}
              title={voiceTitle}>
              {!canSpeak ? "No voice here" : voiceOn ? "Voice on" : "Voice off"}
            </button>
          </div>
        )}
        {compact
          ? <p className="bf-note bf-more">Not advice. <Link className="bf-link" href="/briefing">See every line and its numbers ›</Link></p>
          : <p className="bf-note">Precedence talks. It never listens: no microphone, no typing, nothing leaves this page. Not advice.</p>}
      </div>

      {!compact && <aside className="bf-side">
        <div className="bf-card bf-focus" aria-live="polite">
          {line ? (
            <>
              <span className="bf-kicker">{line.title ?? (line.ticker ? `${line.ticker}` : "Your portfolio")}</span>
              {focus?.row && focus.exp && (
                <div className="bf-holding">
                  <div className="bf-hrow">
                    <span className="bf-tk">{focus.row.symbol}</span>
                    <span className={`bf-badge s-${focus.exp.state ?? "none"}${focus.exp.state == null ? " pro-only" : ""}`}>{stateWords(focus.exp.state)}</span>
                  </div>
                  <div className="bf-hname">{focus.row.name}</div>
                  <div className="bf-hnum">
                    <span>{money(focus.row.value)}</span>
                    {focus.row.change != null && <span className={focus.row.change < 0 ? "down" : "up"}>{pct(focus.row.change)} today</span>}
                  </div>
                </div>
              )}
              {line.cites.length > 0 && (
                <div className="bf-chips">
                  {line.cites.map((c) => {
                    const chip = citeChip(c, line);
                    return chip ? <Link key={c} className="bf-chip" href={chip.href}>{chip.label}</Link> : null;
                  })}
                </div>
              )}
              {line.link && <Link className="bf-link" href={line.link}>See the working →</Link>}
            </>
          ) : (
            <>
              <span className="bf-kicker">Evidence</span>
              <p className="dim">Each line is tied to the numbers it came from. They show up here as it speaks.</p>
            </>
          )}
        </div>

        {lines.length > 0 && (
          <ol className="bf-transcript" aria-label="Transcript">
            {lines.map((l, i) => (
              <li key={l.id} className={`tone-${l.tone}${i === lineIndex && play !== "idle" ? " now" : ""}${i < lineIndex ? " past" : ""}`}>
                <button type="button" onClick={() => onJump(i)} aria-current={i === lineIndex && play !== "idle" ? "step" : undefined}>
                  <span className="bf-dot" aria-hidden />
                  <span>{mode === "pro" && l.pro ? l.pro : l.text}</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {script && (
          <details className="bf-panel">
            <summary>How Precedence decided what to say</summary>
            <p className="dim">A panel of experts, each a plain rule over the data, offered lines; a gate kept the ones that matter and holds the rest. Source: {script.generated_by}.</p>
            <p className="dim">
              {recorded === lines.length
                ? "The voice is Kokoro-82M, an open-weight speech model, reading these exact lines. It was recorded ahead of time and says only what's written here."
                : recorded > 0
                  ? `The voice is Kokoro-82M, an open-weight speech model, recorded ahead of time for ${recorded} of these ${lines.length} lines; your browser's voice reads the rest.`
                  : "The voice is your browser's own."}
            </p>
            <table>
              <thead><tr><th>Expert</th><th className="num">Offered</th><th className="num">Spoke</th></tr></thead>
              <tbody>
                {script.panel.experts.map((e) => (
                  <tr key={e.name}><td>{e.name}</td><td className="num">{e.considered}</td><td className="num">{e.spoken}</td></tr>
                ))}
              </tbody>
            </table>
            {script.panel.held_back.length > 0 && (
              <ul className="bf-held">
                {script.panel.held_back.map((h, i) => <li key={i}>{h.expert && <b>{h.expert}: </b>}<span>{h.text}</span> <em>{h.reason}</em></li>)}
              </ul>
            )}
          </details>
        )}
      </aside>}
    </section>
  );
}
