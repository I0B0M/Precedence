"use client";

// Brief: "understanding what they own" · "summarize complex information". The top of the stock page: its biggest
// days, what happened after news like today's, and the latest news. Facts and counts only, never a forecast.
import Link from "next/link";
import { FilingSummary } from "@/components/FilingSummary";
import type { BigDay, CompanyDetail, SignalResult } from "@/lib/api";
import { afterNews, dayEventWords, recentNews, SUMMARY_FORMS } from "@/lib/company";
import { shortDate } from "@/lib/format";

const signedPct = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(1)}%`;
const eventUrl = (e: BigDay["events"][number]) => (e.kind === "rate_jump" ? null : e.url);

function DayRow({ d }: { d: BigDay }) {
  return (
    <li className="move-row">
      <span className="move-date">{shortDate(d.day)}</span>
      <span className={`move-pct ${d.change_pct < 0 ? "down" : "up"}`}>{signedPct(d.change_pct)}</span>
      <span className="move-events note">
        {d.events.length ? d.events.map((e, i) => {
          const url = eventUrl(e);
          return (
            <span key={i} className="move-event">
              {url ? <a href={url} target="_blank" rel="noopener noreferrer">{dayEventWords(e)}</a> : dayEventWords(e)}
            </span>
          );
        }) : "Nothing filed or reported in the days before."}
      </span>
    </li>
  );
}

/** Worst days · Best days: the 3 biggest daily falls and rises, each with what was public that week. */
export function BigDays({ days, ticker }: { days: CompanyDetail["days"]; ticker: string }) {
  if (!days || (!days.worst.length && !days.best.length)) return null;
  return (
    <div className="card moves-card">
      <span className="kicker">Worst days · Best days</span>
      <div className="moves">
        <div>
          <h3 className="moves-h">Biggest falls</h3>
          <ol className="move-list">{days.worst.map((d) => <DayRow key={d.day} d={d} />)}</ol>
        </div>
        <div>
          <h3 className="moves-h">Biggest rises</h3>
          <ol className="move-list">{days.best.map((d) => <DayRow key={d.day} d={d} />)}</ol>
        </div>
      </div>
      <p className="note">{ticker}&apos;s largest one-day moves in about two years of daily closes. Beside each: what was
        filed or reported in the {days.window_days} trading days up to that close. That&apos;s what was public, not a reason
        for the move.</p>
      <p className="note pro-only pro-add">{days.basis}. {days.source}.</p>
    </div>
  );
}

/** After news like this: each tested signal as a count, then its verdict. */
export function AfterNews({ signals, ticker }: { signals: SignalResult[]; ticker: string }) {
  const rows = signals.map((s) => ({ s, w: afterNews(s, ticker) })).filter((r) => r.w);
  if (!rows.length) return null;
  const lab = (s: SignalResult) => s.signal !== "market_rate_jump";
  return (
    <div className="card">
      <span className="kicker">After news like this</span>
      <ul className="after-list">
        {rows.map(({ s, w }) => (
          <li key={s.signal} className="after-row">
            <span className="after-line">{w!.line}</span>
            <span className="after-verdict">
              <b>{w!.verdict}</b>{s.firing && <span className="after-now"> Happening now.</span>}
              {lab(s) && s.n > 0 && <> <Link className="linkb" href={`/signals?t=${ticker}&s=${s.signal}`}>See each time ›</Link></>}
            </span>
          </li>
        ))}
      </ul>
      <p className="note">Counts from {ticker}&apos;s own history. They say what happened before, not what will happen.</p>
    </div>
  );
}

/** Recent news: the latest filings and insider sales in one dated list, each linked to sec.gov. */
export function RecentNews({ d }: { d: CompanyDetail }) {
  const items = recentNews(d);
  if (!items.length) return null;
  return (
    <div className="card">
      <span className="kicker">Recent news</span>
      <ul className="news-list">
        {items.map((n) => (
          <li key={n.key} className="news-row">
            <span className="news-date">{shortDate(n.at)}</span>
            <span className="news-what">
              {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> : n.title}
              {n.detail && <span className="note news-detail">{n.detail}</span>}
              {n.kind === "filing" && SUMMARY_FORMS.has(n.form) && <FilingSummary accession={n.key} />}
            </span>
          </li>
        ))}
      </ul>
      <p className="note">From SEC EDGAR, dated when the SEC accepted each filing.
        {d.rate && <> 10-year Treasury rate: {d.rate.value.toFixed(2)}% on {shortDate(d.rate.day)} (FRED).</>}</p>
    </div>
  );
}
