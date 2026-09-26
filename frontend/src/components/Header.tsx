"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode } from "@/lib/mode";

const LINKS = [
  { href: "/", label: "What you own" },
  { href: "/lab", label: "Test it" },
  { href: "/import", label: "Bring holdings in" },
];

export function Header() {
  const { mode, toggle } = useMode();
  const path = usePathname();
  return (
    <header className="top">
      <div className="brand">
        <span className="logo">
          ST
          <button className="osw" type="button" onClick={toggle} aria-pressed={mode === "pro"}
            aria-label={mode === "pro" ? "Switch to Lite" : "Switch to Pro"} />
          NE
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
    </header>
  );
}
