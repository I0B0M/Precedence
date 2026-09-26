"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

export type Mode = "lite" | "pro";
const KEY = "stone.mode";

// Remembered in this browser; falls back to memory when storage is blocked.
let memory: Mode = "lite";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === "pro" ? "pro" : localStorage.getItem(KEY) === "lite" ? "lite" : memory;
  } catch {
    return memory;
  }
}

function write(m: Mode) {
  memory = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const ModeContext = createContext<{ mode: Mode; toggle: () => void }>({ mode: "lite", toggle: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribe, read, () => "lite" as Mode);
  useEffect(() => {
    document.body.classList.toggle("pro", mode === "pro");
  }, [mode]);
  const toggle = useCallback(() => write(read() === "lite" ? "pro" : "lite"), []);
  return <ModeContext.Provider value={{ mode, toggle }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
