// One-way narration: the voice reads each line while the page follows along. Built on the browser's
// speechSynthesis (no key, works offline). Where it is missing or refuses, the lines run on a timer
// so the captions and the orb still move. Stone talks; it never listens: there is no microphone here.

import { estimateMs } from "./spoken";

export interface NarratorLine {
  say: string;
}

export interface NarratorEvents {
  /** Line `i` has started. */
  onLine: (i: number) => void;
  /** How far through line `i` the voice is, 0..1, a few times a second. */
  onProgress: (i: number, fraction: number) => void;
  /** Playing, paused, or finished every line. */
  onStatus: (s: "playing" | "paused" | "done") => void;
}

export interface Narrator {
  play: (from?: number) => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  restart: () => void;
  /** Voice on or off; captions and the orb keep going either way. */
  setVoice: (on: boolean) => void;
  destroy: () => void;
  readonly index: number;
  readonly status: "idle" | "playing" | "paused" | "done";
}

export const hasVoice = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";

/** The English voice that sounds best on this machine: a local one first, then any English one. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const preferred = ["Samantha", "Google US English", "Microsoft Aria", "Daniel", "Karen", "Moira"];
  for (const name of preferred) {
    const v = en.find((x) => x.name.startsWith(name));
    if (v) return v;
  }
  return en.find((v) => v.localService) ?? en[0] ?? voices[0] ?? null;
}

export function createNarrator(lines: NarratorLine[], ev: NarratorEvents, opts: { voice?: boolean } = {}): Narrator {
  let index = 0;
  let status: Narrator["status"] = "idle";
  let voiceOn = opts.voice ?? true;
  let run = 0; // bumps on every start/stop so a stale callback can't advance the script
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let current: SpeechSynthesisUtterance | null = null;

  const clearTimers = () => {
    if (timer) clearTimeout(timer);
    if (ticker) clearInterval(ticker);
    timer = null;
    ticker = null;
  };

  const stopVoice = () => {
    if (current) {
      current.onend = null;
      current.onerror = null;
      current.onboundary = null;
      current = null;
    }
    if (hasVoice()) {
      try { window.speechSynthesis.cancel(); } catch { /* nothing to cancel */ }
    }
  };

  const setStatus = (s: "playing" | "paused" | "done") => {
    status = s;
    ev.onStatus(s);
  };

  const finishLine = (myRun: number) => {
    if (myRun !== run) return;
    clearTimers();
    ev.onProgress(index, 1);
    if (index + 1 >= lines.length) {
      current = null;
      setStatus("done");
      return;
    }
    index += 1;
    speak(index);
  };

  /** The timed fallback: progress at reading speed, then the next line. */
  const timed = (i: number, myRun: number, ms: number) => {
    const started = Date.now();
    ticker = setInterval(() => {
      if (myRun !== run) return;
      ev.onProgress(i, Math.min(1, (Date.now() - started) / ms));
    }, 80);
    timer = setTimeout(() => finishLine(myRun), ms);
  };

  const speak = (i: number) => {
    const myRun = ++run;
    clearTimers();
    stopVoice();
    ev.onLine(i);
    ev.onProgress(i, 0);
    const say = lines[i]?.say ?? "";
    const ms = estimateMs(say);
    if (!voiceOn || !hasVoice() || !say) {
      timed(i, myRun, ms);
      return;
    }
    const u = new SpeechSynthesisUtterance(say);
    const voice = pickVoice(window.speechSynthesis.getVoices());
    if (voice) u.voice = voice;
    u.rate = 1.0;
    u.pitch = 1.0;
    let boundaries = 0;
    u.onboundary = (e) => {
      if (myRun !== run) return;
      boundaries += 1;
      ev.onProgress(i, Math.min(1, (e.charIndex + 1) / Math.max(1, say.length)));
    };
    u.onend = () => finishLine(myRun);
    u.onerror = (e) => {
      if (myRun !== run) return;
      // "interrupted" and "canceled" are our own stops; anything else means the voice gave up on this line.
      if (e.error === "interrupted" || e.error === "canceled") return;
      clearTimers();
      timed(i, myRun, ms);
    };
    current = u;
    // Some browsers never fire onboundary; a slow ticker keeps the captions moving in that case, and a
    // watchdog moves on if onend never comes (a known speechSynthesis stall).
    const started = Date.now();
    ticker = setInterval(() => {
      if (myRun !== run || boundaries > 0) return;
      ev.onProgress(i, Math.min(0.95, (Date.now() - started) / ms));
    }, 120);
    timer = setTimeout(() => finishLine(myRun), ms * 2.5 + 3000);
    try {
      window.speechSynthesis.speak(u);
    } catch {
      clearTimers();
      timed(i, myRun, ms);
    }
  };

  const play = (from?: number) => {
    if (!lines.length) { setStatus("done"); return; }
    if (typeof from === "number") index = Math.max(0, Math.min(lines.length - 1, from));
    else if (status === "done") index = 0;
    setStatus("playing");
    speak(index);
  };

  const pause = () => {
    if (status !== "playing") return;
    run += 1;
    clearTimers();
    stopVoice();
    setStatus("paused");
  };

  return {
    play,
    pause,
    toggle: () => (status === "playing" ? pause() : play()),
    next: () => {
      if (index + 1 >= lines.length) { play(index); return; }
      play(index + 1);
    },
    restart: () => play(0),
    setVoice: (on) => {
      if (voiceOn === on) return;
      voiceOn = on;
      if (status === "playing") speak(index); // restart the current line with or without the voice
    },
    destroy: () => {
      run += 1;
      clearTimers();
      stopVoice();
    },
    get index() { return index; },
    get status() { return status; },
  };
}
