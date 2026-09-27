// One-way narration: the voice reads each line while the page follows along. A line with a recording
// (Kokoro-82M, read ahead of time; see recordings.ts) plays that; any other line is read by the
// browser's speechSynthesis (no key, works offline). Where both are missing or refuse, the lines run
// on a timer so the captions and the orb still move. Stone talks; it never listens: there is no
// microphone here.

import { fractionAt, levelAt, type Recording } from "./recordings";
import { estimateMs } from "./spoken";

export interface NarratorLine {
  say: string;
  /** The recorded voice for this line, if there is one. */
  recording?: Recording | null;
}

export interface NarratorEvents {
  /** Line `i` has started. */
  onLine: (i: number) => void;
  /** How far through line `i` the voice is, 0..1, a few times a second, and how loud it is (0..1)
      when a recording says so. */
  onProgress: (i: number, fraction: number, level?: number) => void;
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

/** Whether this page can play a recording. */
export const hasAudio = (): boolean => typeof window !== "undefined" && typeof window.Audio === "function";

/** A breath between two recorded lines, in ms. */
const GAP_MS = 250;

/** The most natural English voice on this machine: a neural one (Edge's "Natural", Apple's Premium or
    Enhanced), then a known good one, then a local English one, then any English one. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const us = (list: SpeechSynthesisVoice[]) => list.find((v) => /^en[-_]US$/i.test(v.lang)) ?? list[0];
  for (const tier of [/\(Natural\)/i, /\(Premium\)/i, /\(Enhanced\)/i]) {
    const v = us(en.filter((x) => tier.test(x.name)));
    if (v) return v;
  }
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
  let audio: HTMLAudioElement | null = null; // one element for every recording, so a tap to play unlocks them all
  let warm: HTMLAudioElement | null = null; // loads the next line's recording while this one plays
  let resumeAt: { index: number; time: number } | null = null;

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
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
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

  /** Play line `i`'s recording from `at` seconds; if it won't play, the browser's voice reads the line. */
  const playRecording = (i: number, rec: Recording, myRun: number, at: number) => {
    const el = (audio ??= new Audio());
    el.preload = "auto";
    if (!el.src.endsWith(rec.src)) el.src = rec.src;
    try { el.currentTime = at; } catch { /* not seekable yet; starts from the top */ }
    const giveUp = () => {
      if (myRun !== run) return;
      clearTimers();
      if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); }
      speakBrowser(i, myRun);
    };
    el.onended = () => {
      if (myRun !== run) return;
      clearTimers();
      ev.onProgress(i, 1, 0);
      timer = setTimeout(() => finishLine(myRun), GAP_MS);
    };
    el.onerror = giveUp;
    ticker = setInterval(() => {
      if (myRun !== run) return;
      ev.onProgress(i, fractionAt(rec, el.currentTime), levelAt(rec, el.currentTime));
    }, 50);
    // A watchdog in case "ended" never comes.
    timer = setTimeout(() => finishLine(myRun), Math.max(0, rec.dur - at) * 1500 + 4000);
    const next = lines[i + 1]?.recording;
    if (next) {
      warm ??= new Audio();
      warm.preload = "auto";
      if (!warm.src.endsWith(next.src)) warm.src = next.src;
    }
    try {
      el.play()?.catch(giveUp);
    } catch {
      giveUp();
    }
  };

  const speak = (i: number, at = 0) => {
    const myRun = ++run;
    clearTimers();
    stopVoice();
    resumeAt = null;
    ev.onLine(i);
    const rec = lines[i]?.recording;
    if (voiceOn && rec && hasAudio()) {
      ev.onProgress(i, fractionAt(rec, at), 0);
      playRecording(i, rec, myRun, at);
      return;
    }
    ev.onProgress(i, 0);
    speakBrowser(i, myRun);
  };

  /** Line `i` in the browser's voice, or on the timer when there is none. */
  const speakBrowser = (i: number, myRun: number) => {
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
    // A paused recording picks up where it stopped; the browser's voice starts its line again.
    const at = typeof from !== "number" && status === "paused" && resumeAt?.index === index ? resumeAt.time : 0;
    if (typeof from === "number") index = Math.max(0, Math.min(lines.length - 1, from));
    else if (status === "done") index = 0;
    setStatus("playing");
    speak(index, at);
  };

  const pause = () => {
    if (status !== "playing") return;
    run += 1;
    clearTimers();
    const rec = lines[index]?.recording;
    const time = audio && rec && !audio.paused && audio.src.endsWith(rec.src) ? audio.currentTime : null;
    stopVoice();
    resumeAt = time === null ? null : { index, time };
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
      for (const el of [audio, warm]) {
        if (!el) continue;
        el.removeAttribute("src");
        el.load(); // stops any download still going
      }
      audio = null;
      warm = null;
    },
    get index() { return index; },
    get status() { return status; },
  };
}
