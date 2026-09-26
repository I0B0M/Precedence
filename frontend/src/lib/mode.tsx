"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Mode = "lite" | "pro";
const KEY = "stone.mode";

const ModeContext = createContext<{ mode: Mode; toggle: () => void }>({ mode: "lite", toggle: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("lite");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "pro") setMode("pro");
    } catch {}
  }, []);

  useEffect(() => {
    document.body.classList.toggle("pro", mode === "pro");
    try {
      localStorage.setItem(KEY, mode);
    } catch {}
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === "lite" ? "pro" : "lite")), []);
  return <ModeContext.Provider value={{ mode, toggle }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
