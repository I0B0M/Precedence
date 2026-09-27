import Link from "next/link";
import { CASTLE_PATH } from "@/components/Castle";

const PAGES: [string, string][] = [
  ["Portfolio", "/portfolio"], ["Import", "/import"], ["Stock pages", "/company/BX"], ["Signals", "/signals"],
  ["Funds", "/fund/SPY"], ["Paper trading", "/paper"], ["Learn", "/learn"], ["Start", "/start"],
];
const DATA = ["SEC filings (EDGAR)", "Form 4 insider trades", "XBRL financials", "Prices (Alpaca, IEX)", "10-year Treasury (FRED)", "SPY holdings (State Street)"];
const SIGNALS: [string, string][] = [
  ["Insider-selling cluster", "/signals?t=BX&s=insider_cluster"], ["Rate jump vs the market", "/signals?t=BX&s=rate_jump"], ["5% drop at the open", "/signals?t=BX&s=gap_down"],
];

/** The gold band from the landing, on every page. */
export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-top">
        <div className="left"><Link href="/learn">Where the data comes from</Link><span className="div" /><Link href="/learn">What the badges mean</Link></div>
        <span>Blackstone track: Reimagining the Investor Experience</span>
      </div>
      <div className="foot-body">
        <div className="foot-col"><b>Pages</b><ul>{PAGES.map(([t, h]) => <li key={h}><Link href={h}>{t}</Link></li>)}</ul></div>
        <div className="foot-col"><b>Data</b><ul>{DATA.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div className="foot-col"><b>Signals</b><ul>{SIGNALS.map(([t, h]) => <li key={t}><Link href={h}>{t}</Link></li>)}</ul></div>
        <div className="foot-legal">
          <p><b>It doesn&rsquo;t predict.</b> Precedence checks every past time an event happened for a stock and shows the hit rate against normal. When a pattern isn&rsquo;t proven, it says so.</p>
          <p><b>Not investment advice.</b> Nothing here is a recommendation to buy or sell. Paper trading uses pretend money at Friday&rsquo;s close and never sends an order.</p>
          <p>Data: SEC, Fed, Alpaca, State Street. Precedence, formerly Stone. ShellHacks 2026.</p>
        </div>
      </div>
      <svg className="foot-mark" viewBox="0 0 1920 300" aria-label="Precedence">
        <path d={CASTLE_PATH} transform="translate(24 40) scale(9.5)" fill="#0b0b0c" />
        <text x="290" y="250" textLength="1606" lengthAdjust="spacingAndGlyphs" fontSize="300" fill="#0b0b0c">Precedence</text>
      </svg>
    </footer>
  );
}
