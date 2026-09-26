"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LabelTag, StateBadge } from "@/components/bits";
import { ApiProblem, Loading } from "@/components/Problem";
import { StartFlow, TodayFunnel } from "@/components/Today";
import { api, type ExposureRow, type FundInfo, type PortfolioOut, type Status } from "@/lib/api";
import { money, pct, shortDate, whole } from "@/lib/format";
import { NO_HOLDINGS, SAMPLE_PORTFOLIO, useHoldings } from "@/lib/holdings";
import { liteSummary, liteVerdict, proSummary } from "@/lib/words";

const FUND_SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };

// Brief: "analyze their existing portfolio" · "understanding what they own" · "make decisions"
export default function HoldingsBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [holdings, setHoldings] = useHoldings(status ? (status.data === "sample" ? SAMPLE_PORTFOLIO : NO_HOLDINGS) : null);

  useEffect(() => {
    api.status().then(setStatus).catch(setError);
  }, []);

  useEffect(() => {
    if (!holdings?.length) return;
    api.portfolio(holdings).then(setBoard).catch(setError);
  }, [holdings]);

  if (error) return <ApiProblem />;
  if (holdings && !holdings.length) return <StartFlow />;
  if (!board) return <Loading what="what you own" />;

  const watching = board.exposure.filter((e) => e.state === "WATCH").length;
  const splitFunds = board.funds.filter((f) => f.looked_through > 0);
  return (
    <section>
      <div className="pf-head">
        <div className="stack" style={{ gap: 6 }}>
          <span className="ticker">Everything you own</span>
          <div className="bignum">{money(board.total)}</div>
          <p className="lede" style={{ color: "var(--text)" }}>
            <span className="lite-only">
              {watching ? `${watching} thing${watching > 1 ? "s" : ""} worth a look today.` : "Nothing needs you today."}
            </span>
            <span className="pro-only">{board.exposure.length} exposures · {watching} on WATCH</span>
          </p>
        </div>
        <p className="note" style={{ maxWidth: "34ch" }}>
          <span className="lite-only">Tap a holding to see what&apos;s going on, in plain words.</span>
          <span className="pro-only">WATCH only when a signal that has proven itself on this stock is firing.</span>
          {" "}{board.price_as_of ? `Values at the close on ${shortDate(board.price_as_of)}.` : "Values at the latest close in Stone's price data."}
        </p>
      </div>

      <TodayFunnel symbols={(holdings ?? []).map((h) => h.symbol)} />

      <div className="rows">
        {board.exposure.map((e) => {
          const row = board.rows.find((r) => r.symbol === e.symbol);
          const isOpen = open === e.symbol;
          return (
            <div key={e.symbol} className={`hitem${isOpen ? " open" : ""}`}>
              <button type="button" className="hrow" aria-expanded={isOpen} aria-controls={`panel-${e.symbol}`}
                onClick={() => setOpen(isOpen ? null : e.symbol)}>
                <span>
                  <span className="tk">{e.symbol}</span>
                  <span className="nm">{e.name}</span>
                </span>
                <span className="say">
                  <span className="lite-only">{row?.kind === "crypto" ? "Crypto: Stone has no signals for it yet." : row?.kind === "etf" && !e.firing.length ? "A fund: many stocks in one." : liteSummary(e.firing)}</span>
                  <span className="pro-only">{proSummary(e.firing)}</span>
                </span>
                <span className="val">
                  {money(e.total)}
                  <small className={row?.change != null && row.change < 0 ? "down" : "up"}>
                    {row?.change != null ? `${pct(row.change)} ${row.kind === "crypto" ? "in 24h" : "today"}` : <span className="mute">{whole(e.share_of_total)} of total</span>}
                  </small>
                </span>
                <span className="hend">
                  <StateBadge state={e.state} />
                  <span className="chev" aria-hidden>›</span>
                </span>
              </button>
              <div className="hpanel" id={`panel-${e.symbol}`} inert={!isOpen}>
                <div><Panel e={e} kind={row?.kind} fund={board.funds.find((f) => f.symbol === e.symbol)} portfolio={board.total} /></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ gap: 6, marginTop: 14 }}>
        {board.funds.map((f) => <FundLine key={f.symbol} f={f} />)}
        {splitFunds.length > 0 && (
          <p className="note">
            {splitFunds.map((f) => f.symbol).join(", ")} {splitFunds.length > 1 ? "are" : "is"} split into what {splitFunds.length > 1 ? "they hold" : "it holds"},
            so a stock you own through {splitFunds.length > 1 ? "those funds" : "that fund"} shows up here too.
          </p>
        )}
        {board.unknown.length > 0 && <p className="badline">No data yet for {board.unknown.join(", ")}.</p>}
      </div>

      <div className="row-flex" style={{ marginTop: 20 }}>
        <Link className="btn small" href="/import">Add an account</Link>
        {status?.data === "sample" && (
          <button className="linkb" type="button" onClick={() => setHoldings(SAMPLE_PORTFOLIO)}>Reset to the sample portfolio</button>
        )}
      </div>
    </section>
  );
}

function FundLine({ f }: { f: FundInfo }) {
  return (
    <p className="note">
      <b>{f.symbol}:</b>{" "}
      {f.as_of
        ? <>Holdings as of {shortDate(f.as_of)}, {FUND_SOURCES[f.source ?? ""] ?? f.source}.<span className="pro-only"> {whole(f.looked_through)} looked through.</span></>
        : "Not looked through yet: shown as the fund."}
    </p>
  );
}

/** Opens in place under a row: what's going on, and what it means for you in dollars. */
function Panel({ e, kind, fund, portfolio }: { e: ExposureRow; kind?: string; fund?: FundInfo; portfolio: number }) {
  const viaEtf = Object.values(e.via_etf).reduce((a, b) => a + b, 0);
  const isFund = kind === "etf";
  const isCrypto = kind === "crypto"; // state null ("Not tested"); no company page, no signals
  // A fund row stands for only part of the fund (the rest shows as its stocks), so judge the whole fund from `direct`.
  const share = isFund ? (portfolio ? e.direct / portfolio : null) : e.share_of_total;
  const badDay = isFund ? (e.bad_day_return != null ? e.bad_day_return * e.direct : null) : e.bad_day_loss;
  const [allKids, setAllKids] = useState(false);
  const kids = allKids ? e.children : e.children.slice(0, 6);
  return (
    <div className="hdetail">
      <div className="stack" style={{ gap: 8 }}>
        <h3>What&apos;s going on</h3>
        {isFund && (
          <p>{fund?.as_of ? `A fund. Its holdings are from ${shortDate(fund.as_of)}.` : "A fund. Its holdings aren't loaded yet, so it's shown as one line."}</p>
        )}
        {isCrypto && <p>Crypto isn&apos;t covered by Stone&apos;s signals yet, so there&apos;s nothing tested to report.</p>}
        {!isCrypto && (!isFund || e.firing.length > 0) && (
          <>
            {e.firing.length > 0 ? (
              <div className="list">
                {e.firing.map((s) => (
                  <div key={s.signal} className="list-row">
                    <span>
                      <span className="lite-only"><b>{s.lite}.</b> <span className="mute">{liteVerdict(s)}</span></span>
                      <span className="pro-only">{s.pro}</span>
                    </span>
                    <span className="pro-only"><LabelTag label={s.label} /></span>
                  </div>
                ))}
              </div>
            ) : <p className="mute">Nothing important today.</p>}
          </>
        )}
        {e.children.length > 0 && (
          <div className="list">
            <p className="list-head">Smaller holdings inside {e.symbol} (under 1% of what you own each)</p>
            {kids.map((k) => (
              <Link key={k.symbol} className="list-row" href={`/company/${k.symbol}`}>
                <span>{k.symbol} <span className="mute">{k.name}</span></span>
                <span>{money(k.total)}</span>
              </Link>
            ))}
            {e.children.length > 6 && (
              <button type="button" className="linkb" style={{ paddingTop: 8 }} onClick={() => setAllKids(!allKids)}>
                {allKids ? "Show fewer" : `Show all ${e.children.length}`}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h3>What it means for you</h3>
        <dl className="kv">
          <dt>You own directly</dt><dd>{money(e.direct)}</dd>
          {viaEtf > 0 && (<><dt>Inside your funds</dt><dd>{money(viaEtf)}</dd></>)}
          {isFund && e.direct > e.total && (<><dt>Shown above and below as its stocks</dt><dd>{money(e.direct - e.total)}</dd></>)}
          <dt>Share of everything you own</dt><dd>{whole(share)}</dd>
          <dt>A bad day could cost you</dt>
          <dd className="down">{money(badDay)}<span className="pro-only note"> ({pct(e.bad_day_return)})</span></dd>
        </dl>
        <p className="note">&quot;A bad day&quot; is the 1-in-20 worst day of the past year{isFund ? ", for the whole fund" : ""}.</p>
        {kind !== "etf" && !isCrypto && <Link className="linkb" href={`/company/${e.symbol}`}>Open {e.symbol} ›</Link>}
      </div>
    </div>
  );
}
