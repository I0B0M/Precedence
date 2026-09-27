import Link from "next/link";
import { NAV } from "@/lib/nav";

const SOURCES = [
  { name: "SEC EDGAR", what: "filings, XBRL facts, Form 4" },
  { name: "FRED", what: "10-year Treasury rate (DGS10)" },
  { name: "Alpaca (IEX feed)", what: "daily prices" },
  { name: "State Street (SSGA)", what: "SPY holdings" },
];

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-grid">
        <div className="foot-col">
          <span className="kicker">Precedence</span>
          <nav aria-label="Footer">
            {NAV.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          </nav>
        </div>
        <div className="foot-col">
          <span className="kicker">Where the data comes from</span>
          <ul>
            {SOURCES.map((s) => <li key={s.name}><b>{s.name}</b> <span className="mute">· {s.what}</span></li>)}
          </ul>
        </div>
      </div>
      <p className="note">Not investment advice. Paper trading uses pretend money; no order is ever sent. Built at ShellHacks 2026.</p>
    </footer>
  );
}
