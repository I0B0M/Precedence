"use client";

import { useEffect, useRef, useState } from "react";
import { OrbRenderer } from "./renderer";
import { ORB_PALETTE, TINT_GLOW, cssColor, type OrbState } from "./palette";

/** A gentle tilt toward the mouse, layered on top of the float/drift the CSS handles — this is the one part of
 *  the motion that needs live input, so it's the one part done with a rAF loop instead of a keyframe. Off
 *  under prefers-reduced-motion, same as the CSS float. */
function useTilt(ref: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)) return;
    let raf = 0, targetX = 0, targetY = 0, curX = 0, curY = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      targetX = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      targetY = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    };
    const tick = () => {
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      el.style.setProperty("--tilt-x", (curY * -6).toFixed(3) + "deg"); // mouse up (negative y) tilts the top back
      el.style.setProperty("--tilt-y", (curX * 8).toFixed(3) + "deg");
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [ref, active]);
}

/** The orb, as a React component. Degrades to a CSS orb when WebGL isn't there, never to nothing.
 *  big: the landing hero's centerpiece — float, drift and mouse-tilt on top of the renderer's own motion;
 *  the small strip elsewhere stays still (the caption text next to it is the thing moving). */
export function Orb({ state, size = 360, big = false }: { state: OrbState; size?: number; big?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OrbRenderer | null>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  useTilt(motionRef, big);

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
  const level = state.state === "speaking" ? (state.level ?? 0) : 0;
  return (
    <div ref={motionRef} className={`orb-motion${big ? " orb-big" : ""}`} style={{ "--pulse": 1 + level * 0.05 } as React.CSSProperties}>
      <div className="orb" style={{ width: size, height: size }} data-state={state.state} aria-hidden>
        <canvas ref={canvasRef} className={fallback ? "hidden" : undefined} />
        {fallback && <div className="css-orb" style={{ "--glow": cssColor(glow) } as React.CSSProperties} />}
      </div>
    </div>
  );
}
