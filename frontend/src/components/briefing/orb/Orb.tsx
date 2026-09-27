"use client";

import { useEffect, useRef, useState } from "react";
import { OrbRenderer } from "./renderer";
import { ORB_PALETTE, TINT_GLOW, cssColor, type OrbState } from "./palette";

/** The orb, as a React component. Degrades to a CSS orb when WebGL isn't there, never to nothing. */
export function Orb({ state, size = 360 }: { state: OrbState; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OrbRenderer | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const r = new OrbRenderer(canvas, { reduceMotion, onFallback: () => setFallback(true) });
    rendererRef.current = r;
    return () => {
      r.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setState(state);
  }, [state]);

  const glow = state.state === "speaking" && state.tint ? TINT_GLOW[state.tint] : ORB_PALETTE[state.state].glow;
  return (
    <div className="orb" style={{ width: size, height: size }} data-state={state.state} aria-hidden>
      <canvas ref={canvasRef} className={fallback ? "hidden" : undefined} />
      {fallback && <div className="css-orb" style={{ "--glow": cssColor(glow) } as React.CSSProperties} />}
    </div>
  );
}
