"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMode, type Mode } from "@/lib/mode";
import { NAV } from "@/lib/nav";

const MODES: { value: Mode; label: string }[] = [
  { value: "lite", label: "Lite" },
  { value: "pro", label: "Pro" },
];

const isCurrent = (path: string, l: (typeof NAV)[number]) => [l.href, ...l.also].some((p) => path === p || path.startsWith(p + "/"));

/** Sticky header: gains a hairline once the page scrolls. On a phone the links fold into a full-screen menu. */
export function Header() {
  const { mode, toggle, set } = useMode();
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<string | null>(null); // the path the menu was opened on
  const open = menu === path; // navigating away closes it

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", esc); };
  }, [open]);

  const seg = (
    <div className="seg" role="group" aria-label="Mode" data-value={mode}>
      {MODES.map((m) => (
        <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => set(m.value)}>{m.label}</button>
      ))}
    </div>
  );

  return (
    <header className={`top${scrolled ? " scrolled" : ""}`}>
      <div className="brand">
        {/* ST◯NE: the O is the switch. Ring = Lite, filled = Pro. */}
        <span className="logo">
          <Link href="/" aria-label="Stone home" className="logo-link"><span aria-hidden>ST</span></Link>
          <button className="osw" type="button" role="switch" onClick={toggle} aria-checked={mode === "pro"}
            aria-label="Pro mode" title={mode === "pro" ? "Tap the O for Lite" : "Tap the O for Pro"} />
          <Link href="/" tabIndex={-1} aria-hidden className="logo-link"><span>NE</span></Link>
        </span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isCurrent(path, l) ? "page" : undefined}>{l.label}</Link>
        ))}
      </nav>
      <div className="top-end">
        {seg}
        <Link className="btn small top-add" href="/import">Add account</Link>
        <button type="button" className="menu-btn" aria-expanded={open} aria-controls="menu" onClick={() => setMenu(open ? null : path)}>
          <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
          <span className="burger" aria-hidden data-open={open} />
        </button>
      </div>

      <div id="menu" className="menu" data-open={open} inert={!open}>
        <nav aria-label="Main (menu)">
          {NAV.map((l, i) => (
            <Link key={l.href} href={l.href} style={{ "--i": i } as React.CSSProperties}
              aria-current={isCurrent(path, l) ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="menu-end">
          {seg}
        </div>
      </div>
    </header>
  );
}
