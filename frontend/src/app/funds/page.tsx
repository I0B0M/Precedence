"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { ApiProblem, Loading } from "@/components/Problem";
import { api, type FundPage } from "@/lib/api";
import { money, pct, shortDate } from "@/lib/format";
import { readHoldings } from "@/lib/holdings";
import { useOtherAssets } from "@/lib/other-assets";
import { fundLine } from "@/lib/words";
import { SHOW_PRIVATE_FUNDS } from "@/lib/flags";
import { PRIVATE_FUNDS, PRIVATE_LITE, privateFund, type PrivateFundKey, type PrivateFundPage } from "@/lib/private-funds";

// The S&P 500 funds and QQQ that Precedence has fund pages for, shown after the funds you hold.
const SHOWN = ["SPY", "VOO", "IVV", "QQQ"];
const SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };

// Brief: "understanding what they own". Blackstone coaching: investors think in funds.
export default function FundsIndex() {
  const other = useOtherAssets();
  const [held, setHeld] = useState<string[] | null>(null);
  const [pages, setPages] = useState<Record<string, FundPage | null>>({});
  const [error, setError] = useState<unknown>(null);
  const [priv, setPriv] = useState<Record<string, PrivateFundPage | null>>({});
  useEffect(() => {
    if (!SHOW_PRIVATE_FUNDS) return;
    Promise.all(PRIVATE_FUNDS.map((s) => privateFund(s).then((p) => [s, p] as const).catch(() => [s, null] as const)))
      .then((pairs) => setPriv(Object.fromEntries(pairs)));
  }, []);

  // Which of your holdings are funds: the API's own kind for each ticker.
  useEffect(() => {
    const mine = (readHoldings() ?? []).map((h) => h.symbol);
    api.companies().then((cos) => setHeld(mine.filter((s) => cos.find((c) => c.ticker === s)?.kind === "etf"))).catch(setError);
  }, []);

  const retirement = other.retirement;
  const standIns = retirement.map((r) => r.lookup?.behaves_like ?? null).filter((b) => b !== null) as string[];
  const symbols = held ? [...new Set([...held, ...standIns, ...SHOWN])] : [];
  const key = symbols.join(",");
  useEffect(() => {
    if (!key) return;
    Promise.all(key.split(",").map((s) => api.fund(s).then((f) => [s, f] as const).catch(() => [s, null] as const)))
      .then((pairs) => setPages(Object.fromEntries(pairs)));
  }, [key]);

  if (error) return <ApiProblem />;
  if (!held || (key && !Object.keys(pages).length)) return <Loading what="funds" />;

  const yours = held.filter((s) => pages[s]);
  const privHeld = SHOW_PRIVATE_FUNDS ? PRIVATE_FUNDS.filter((s) => other.privateFunds.some((f) => f.fund === s)) : [];
  const privRest = SHOW_PRIVATE_FUNDS ? PRIVATE_FUNDS.filter((s) => !privHeld.includes(s)) : [];
  const rest = SHOWN.filter((s) => !held.includes(s) && pages[s]);
  const first = yours[0] ?? retirement.find((r) => r.lookup?.behaves_like)?.lookup?.behaves_like ?? rest[0] ?? null;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="kicker">Funds</span>
        <h1>{yours.length || retirement.length ? "Your funds" : "Funds"}</h1>
        <p className="lede">Many stocks in one. Tap one to see what&apos;s inside.</p>
      </div>

      {(yours.length > 0 || retirement.length > 0 || privHeld.length > 0) && (
        <div className="card">
          <h3>What you own</h3>
          <div className="list">
            {yours.map((s) => <FundRow key={s} f={pages[s] as FundPage} />)}
            {privHeld.map((s) => <PrivateRow key={s} symbol={s} p={priv[s] ?? null} />)}
            {retirement.map((r) => {
              const like = r.lookup?.behaves_like ?? null;
              const label = `${r.lookup?.ticker ?? r.name}`;
              const body = (
                <>
                  <span>
                    <b>{label}</b> <span className="mute">{r.lookup?.name ?? r.name}</span>
                    <span className="note" style={{ display: "block" }}>
                      {r.account} · {money(r.amount)} · {like ? `Behaves like ${like === "SPY" ? "the S&P 500" : like}` : "Not tested yet."}
                    </span>
                    {r.lookup?.basis && <span className="note pro-only pro-add" style={{ display: "block" }}>{r.lookup.match ?? "match"}: {r.lookup.basis}</span>}
                  </span>
                  <span className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>
                    {like ? <><StateBadge state={pages[like]?.fund_state ?? null} /> <span aria-hidden>›</span></> : <StateBadge state={null} />}
                  </span>
                </>
              );
              return like
                ? <Link key={r.id} className="list-row" href={`/fund/${like}`} aria-label={`${label} behaves like ${like}: open ${like}`}>{body}</Link>
                : <div key={r.id} className="list-row">{body}</div>;
            })}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="card">
          <h3>{yours.length || retirement.length ? "More funds" : "Funds on Precedence"}</h3>
          <div className="list">
            {rest.map((s) => <FundRow key={s} f={pages[s] as FundPage} />)}
          </div>
        </div>
      )}

      {privRest.length > 0 && (
        <div className="card">
          <h3>Blackstone funds</h3>
          <div className="list">
            {privRest.map((s) => <PrivateRow key={s} symbol={s} p={priv[s] ?? null} />)}
          </div>
          <p className="note">Not traded on an exchange. Priced once a month from their own SEC filings.</p>
        </div>
      )}

      {first && (
        <div className="next-step">
          <Link className="btn t-go" href={`/fund/${first}`}>See what&apos;s inside {first} →</Link>
        </div>
      )}
    </section>
  );
}

/** A monthly-priced Blackstone fund: one Classic line; Pro adds its latest monthly value and where it comes from. */
function PrivateRow({ symbol, p }: { symbol: PrivateFundKey; p: PrivateFundPage | null }) {
  return (
    <Link className="list-row" href={`/fund/${symbol}`}>
      <span>
        <b>{symbol}</b> <span className="mute">{p?.name ?? ""}</span>
        <span className="note" style={{ display: "block" }}>{PRIVATE_LITE[symbol]}</span>
        {p?.nav && (
          <span className="note pro-only pro-add" style={{ display: "block" }}>
            {money(p.nav.value, true)} a share, Class {p.nav.share_class}, {shortDate(p.nav.as_of)}
            {p.returns.m1 != null ? ` · value per share ${pct(p.returns.m1)} in the last month (distributions not included)` : ""} · {p.source}
          </span>
        )}
      </span>
      <span className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>

        <StateBadge state={null} />
        <span aria-hidden>›</span>
      </span>
    </Link>
  );
}

/** One fund: name, the last day's move, its badge, one Classic line; Pro adds where its holdings come from. */
function FundRow({ f }: { f: FundPage }) {
  const ch = f.price?.change_1d ?? null;
  const from = f.note?.match(/holdings from ([A-Z.]+)/)?.[1] ?? null;
  const source = f.holdings_source ? SOURCES[f.holdings_source] ?? f.holdings_source : null;
  return (
    <Link className="list-row" href={`/fund/${f.symbol}`}>
      <span>
        <b>{f.symbol}</b> <span className="mute">{f.name}</span>
        <span className="note" style={{ display: "block" }}>
          {fundLine(f)}
        </span>
        <span className="note pro-only pro-add" style={{ display: "block" }}>
          {f.holdings_as_of
            ? `${f.total_holdings_count} holdings${from && from !== f.symbol ? ` (${from}'s file)` : ""}, ${source ?? "holdings file"}, ${shortDate(f.holdings_as_of)}; ${Math.round(f.looked_through_share * 100)}% in stocks Precedence tracks.`
            : "No holdings file loaded."}
          {f.price ? ` Close ${money(f.price.last_close, true)} on ${shortDate(f.price.as_of)}.` : ""}
        </span>
      </span>
      <span className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>
        {ch != null && <span className={ch < 0 ? "down" : "up"}>{pct(ch)}</span>}
        <StateBadge state={f.fund_state} />
        <span aria-hidden>›</span>
      </span>
    </Link>
  );
}
