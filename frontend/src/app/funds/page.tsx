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

// The S&P 500 funds and QQQ that Precedence has fund pages for, shown after the funds you hold.
const SHOWN = ["SPY", "VOO", "IVV", "QQQ"];
const SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };

// Brief: "understanding what they own". Blackstone coaching: investors think in funds.
export default function FundsIndex() {
  const other = useOtherAssets();
  const [held, setHeld] = useState<string[] | null>(null);
  const [pages, setPages] = useState<Record<string, FundPage | null>>({});
  const [error, setError] = useState<unknown>(null);

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
  const rest = SHOWN.filter((s) => !held.includes(s) && pages[s]);
  const first = yours[0] ?? retirement.find((r) => r.lookup?.behaves_like)?.lookup?.behaves_like ?? rest[0] ?? null;

  return (
    <section className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="kicker">Funds</span>
        <h1>{yours.length || retirement.length ? "Your funds" : "Funds"}</h1>
        <p className="lede">Many stocks in one. Tap one to see what&apos;s inside.</p>
      </div>

      {(yours.length > 0 || retirement.length > 0) && (
        <div className="card">
          <h3>What you own</h3>
          <div className="list">
            {yours.map((s) => <FundRow key={s} f={pages[s] as FundPage} />)}
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

      {first && (
        <div className="next-step">
          <Link className="btn t-go" href={`/fund/${first}`}>See what&apos;s inside {first} →</Link>
        </div>
      )}
    </section>
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
