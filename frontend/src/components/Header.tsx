"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode, type Mode } from "@/lib/mode";

const LINKS = [
  { href: "/", label: "What you own" },
  { href: "/lab", label: "Test it" },
  { href: "/import", label: "Bring holdings in" },
];

const MODES: { value: Mode; label: string }[] = [
  { value: "lite", label: "Lite" },
  { value: "pro", label: "Pro" },
];

export function Header() {
  const { mode, toggle, set } = useMode();
  const path = usePathname();
  return (
    <header className="top">
      <div className="brand">
        {/* ST◯NE: the O is the switch. Ring = Lite, filled = Pro. */}
        <span className="logo">
          <span className="sr-only">Stone</span>
          <span aria-hidden>ST</span>
          <button className="osw" type="button" role="switch" onClick={toggle} aria-checked={mode === "pro"}
            aria-label="Pro mode" title={mode === "pro" ? "Tap the O for Lite" : "Tap the O for Pro"} />
          <span aria-hidden>NE</span>
        </span>
        <span className="modetag">{mode === "pro" ? "Pro · tap the O for Lite" : "Lite · tap the O for Pro"}</span>
      </div>
      <nav className="nav" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}
            aria-current={(l.href === "/" ? path === "/" || path.startsWith("/company") : path.startsWith(l.href)) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="seg" role="group" aria-label="Mode" data-value={mode}>
        {MODES.map((m) => (
          <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => set(m.value)}>{m.label}</button>
        ))}
      </div>
    </header>
  );
}
