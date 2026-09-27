"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LabelTag, StateBadge } from "@/components/bits";
import { api, type Today } from "@/lib/api";
import { shortDate } from "@/lib/format";

const SOURCES = [
  { name: "SEC EDGAR", lite: "What companies file: reports, news, insider sales.", pro: "10-K, 10-Q, 8-K, Form 4 and XBRL facts, timed by SEC acceptance." },
  { name: "FRED", lite: "The 10-year Treasury rate.", pro: "DGS10, dated when it was published, not the day it describes." },
  { name: "Alpaca (IEX)", lite: "Daily stock prices.", pro: "Daily open and close from the IEX feed; entries at the next open." },
  { name: "State Street", lite: "What's inside SPY.", pro: "SSGA's daily SPY holdings file, used for the fund look-through." },
];

// Brief: "more accessible" · "summarize complex information"
export default function Learn() {
  const [today, setToday] = useState<Today | null>(null);
  useEffect(() => {
    api.today().then(setToday).catch(() => {});
  }, []);
  const asOf: Record<string, string | null | undefined> = {
    "SEC EDGAR": today?.market.filings.as_of,
    FRED: today?.market.rate?.day,
    "Alpaca (IEX)": today?.day,
  };

  return (
    <section className="stack" style={{ gap: 56 }}>
      <div className="stack" style={{ gap: 12 }}>
        <span className="kicker">Learn</span>
        <h1>How Precedence works</h1>
        <p className="lede">Public data in, one plain answer out.</p>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <h2>Where the data comes from</h2>
        <div className="learn-grid">
          {SOURCES.map((s) => (
            <div key={s.name} className="learn-tile">
              <b>{s.name}</b>
              <p><span className="lite-only">{s.lite}</span><span className="pro-only">{s.pro}</span></p>
              {asOf[s.name] && <span className="note">Latest: {shortDate(asOf[s.name] as string)}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <h2>What the badges mean</h2>
        <div className="learn-grid three">
          <div className="learn-tile"><StateBadge state="CALM" /><p>Nothing that has mattered before is happening.</p></div>
          <div className="learn-tile"><StateBadge state="WATCH" /><p>Something that has mattered for this stock before is happening now.</p></div>
          <div className="learn-tile"><StateBadge state={null} /><p>We haven&apos;t tested this one, so it says nothing.</p></div>
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <h2>Real pattern, or not proven?</h2>
        <p className="lede">The dark bar is where the real rate likely is. The blue line is a normal week.</p>
        <div className="learn-grid">
          <Figure label="STRONG" words="The whole bar is right of the line: it has mattered." left={58} width={26} normal={40} />
          <Figure label="NOT PROVEN" words="The bar crosses the line: could be chance." left={30} width={44} normal={48} />
        </div>
        <p className="note">Illustrations, not data. Every real bar here comes from that stock&apos;s own history.</p>
        <div className="pro-only card">
          <h3>The rules</h3>
          <ul className="learn-rules">
            <li>STRONG only when the 90% Wilson range&apos;s low end beats the normal-day rate.</li>
            <li>Fewer than 10 past cases is always WEAK.</li>
            <li>Hold-out: a STRONG result is re-checked on each half of the two years.</li>
            <li>Events are timed from when the public could know (SEC acceptance, FRED release); entry is the next open.</li>
            <li>Rate jumps hit every stock at once, so there a hit means doing worse than SPY.</li>
            <li><LabelTag label="NO DATA" /> means the source isn&apos;t loaded, so nothing was tested.</li>
          </ul>
        </div>
      </div>

      <div className="next-step">
        <p>See it on a real portfolio.</p>
        <Link className="btn t-go" href="/import?example=1">Try it with an example</Link>
      </div>
    </section>
  );
}

function Figure({ label, words, left, width, normal }: { label: "STRONG" | "NOT PROVEN"; words: string; left: number; width: number; normal: number }) {
  return (
    <div className="learn-tile">
      <LabelTag label={label} />
      <div className="rangebar" aria-hidden>
        <div className="track" />
        <div className="span" style={{ left: `${left}%`, width: `${width}%` }} />
        <div className="normal" style={{ left: `${normal}%` }}><span>normal</span></div>
      </div>
      <p>{words}</p>
    </div>
  );
}
