"use client";

import { useEffect, useState } from "react";
import { Verdict } from "@/components/bits";
import { api, type CompanyToday } from "@/lib/api";
import { dateTimeET, money, pct, shortDate } from "@/lib/format";
import { FORM_WORDS } from "@/lib/words";

const monthDay = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso)
  .toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/** "today" only when the close really is today in New York; else "on Friday" (within a week) or "on Sep 25". */
function whenWords(asOf: string): string {
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (asOf === todayET) return "today";
  const days = (new Date(todayET + "T12:00:00").getTime() - new Date(asOf + "T12:00:00").getTime()) / 864e5;
  return days > 0 && days < 7
    ? `on ${new Date(asOf + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}`
    : `on ${monthDay(asOf)}`;
}

/** "Up 1.0%" / "Down 0.4%" / "Flat" */
function moveWords(v: number): string {
  if (Math.abs(v) < 0.0005) return "Flat";
  return `${v > 0 ? "Up" : "Down"} ${pct(Math.abs(v), false)}`;
}

/** Classic: at most two short lines of what happened in the same days. Facts only, never a cause. */
function aroundLines(t: CompanyToday): string[] {
  const e = t.events;
  const out: string[] = [];
  const f = [...e.filings].sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))[0];
  if (f) out.push(`${FORM_WORDS[f.form] ?? f.form} on ${monthDay(f.accepted_at)}`);
  for (const s of e.signals_firing.filter((x) => x.in_window)) out.push(s.lite);
  if (e.insider_sales?.length) out.push(`${e.insider_sales.length} insider sale${e.insider_sales.length > 1 ? "s" : ""} filed`);
  if (e.rate_move && Math.abs(e.rate_move.change) >= 0.1 && !e.signals_firing.some((x) => x.in_window && x.signal === "rate_jump")) {
    out.push(`Interest rates ${e.rate_move.change > 0 ? "rose" : "fell"}`);
  }
  return out.slice(0, 2);
}

// Brief: "understanding what they own". The stock page says plainly whether it's up or down and what happened in the
// same days, from GET /api/companies/{t}/today. Nothing here says why the price moved.
export function TodayMove({ ticker }: { ticker: string }) {
  const [t, setT] = useState<{ ticker: string; body: CompanyToday | null } | null>(null);
  useEffect(() => {
    let live = true;
    api.companyToday(ticker).then((body) => live && setT({ ticker, body })).catch(() => live && setT({ ticker, body: null }));
    return () => { live = false; };
  }, [ticker]);
  const d = t?.ticker === ticker ? t.body : null;
  if (!d || d.day_change_pct == null) return null;

  const e = d.events;
  const around = aroundLines(d);
  const spy = d.spy_change_pct;
  const sources = [d.sources.prices.name, ...d.sources.filings.map((s) => s.name), d.sources.rate?.name, d.sources.signals.name]
    .filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const sales = e.insider_sales ?? [];

  return (
    <div className="box today-move">
      <p className="say-big">
        <b className={d.day_change_pct < 0 ? "down" : d.day_change_pct > 0 ? "up" : undefined}>{moveWords(d.day_change_pct)} {whenWords(d.as_of)}.</b>
        {spy != null && <> The market was {Math.abs(spy) < 0.0005 ? "flat" : `${spy > 0 ? "up" : "down"} ${pct(Math.abs(spy), false)}`}.</>}
      </p>
      {around.length > 0 ? (
        <p><span className="mute">Around it:</span> {around.join(". ")}.</p>
      ) : e.insider_sales != null && <p className="mute">Nothing new filed this week.</p>}

      <div className="pro-only pro-add stack" style={{ gap: 12 }}>
        <dl className="kv">
          <dt>Last close</dt>
          <dd>{money(d.close, true)} <span className="note">{shortDate(d.as_of)}</span></dd>
          <dt>Change</dt>
          <dd className={d.day_change_pct < 0 ? "down" : "up"}>{pct(d.day_change_pct, true, 2)}
            {d.day_change != null && <span className="note"> ({d.day_change < 0 ? "−" : "+"}{money(Math.abs(d.day_change), true)} a share)</span>}</dd>
          <dt>{d.market_symbol} the same day</dt>
          <dd>{spy == null ? "—" : pct(spy, true, 2)}</dd>
          {d.vs_market && <><dt>Next to the market</dt><dd>{d.vs_market}{d.same_direction === false ? ", the other way" : ""}</dd></>}
          <dt>Window</dt>
          <dd>{shortDate(d.window.start)} – {shortDate(d.window.end)} <span className="note">({d.window.trading_days} trading days)</span></dd>
        </dl>

        <div className="list">
          <p className="list-head">Filings in the window (SEC acceptance time)</p>
          {e.filings.length ? e.filings.map((f) => (
            <div key={f.accepted_at + f.form} className="list-row">
              <span>{FORM_WORDS[f.form] ?? f.form}{(FORM_WORDS[f.form] ?? f.form).includes(f.form) ? "" : <span className="note"> ({f.form})</span>}</span>
              <span className="mute">{dateTimeET(f.accepted_at)}{f.url && <> · <a href={f.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}</span>
            </div>
          )) : <p className="mute">None.</p>}
        </div>

        <div className="list">
          <p className="list-head">Insider sales (Form 4)</p>
          {e.insider_sales == null ? <p className="mute">Form 4s aren&apos;t loaded for {d.ticker}.</p>
            : !sales.length ? <p className="mute">None filed in the window.</p>
            : sales.slice(0, 10).map((s, i) => (
              <div key={i} className="list-row">
                <span>{s.owner_name ?? "Unnamed filer"}{s.owner_title && <span className="note"> · {s.owner_title}</span>}
                  <span className="note" style={{ display: "block" }}>
                    {s.shares != null ? `${s.shares.toLocaleString("en-US")} shares` : "shares —"}{s.price != null ? ` at ${money(s.price, true)}` : ""}
                    {s.transaction_date ? `, traded ${shortDate(s.transaction_date)}` : ""}
                  </span>
                </span>
                <span className="mute">{dateTimeET(s.accepted_at)}{s.url && <> · <a href={s.url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}</span>
              </div>
            ))}
          {sales.length > 10 && <p className="note">And {sales.length - 10} more.</p>}
        </div>

        {e.rate_move && (
          <p className="note">
            <b>10-year Treasury (DGS10):</b> {e.rate_move.from_value.toFixed(2)}% on {shortDate(e.rate_move.from_day)} → {e.rate_move.to_value.toFixed(2)}% on {shortDate(e.rate_move.to_day)},
            {" "}{e.rate_move.change >= 0 ? "+" : "−"}{Math.abs(e.rate_move.change).toFixed(2)} pt; known {dateTimeET(e.rate_move.known_at)}.
          </p>
        )}

        {e.signals_firing.length > 0 && (
          <div className="list">
            <p className="list-head">Signals firing now</p>
            {e.signals_firing.map((s) => (
              <div key={s.signal} className="list-row">
                <span>{s.lite} <Verdict s={s} />
                  <span className="note" style={{ display: "block" }}>
                    {s.note}{s.in_window ? " · became known in this window" : ""}
                    {s.fdr10_survives === true ? " · survives the correction" : ""}
                  </span>
                </span>
                <span className="mute">{dateTimeET(s.known_at)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="note">
          These happened in the same days; none of them is given as the cause. {d.window.note}
          {sources.length > 0 && <> Sources: {sources.join(" · ")}.</>}
        </p>
      </div>
    </div>
  );
}
