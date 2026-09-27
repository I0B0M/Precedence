"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OwnMap } from "@/components/OwnMap";
import { RiskCard } from "@/components/RiskCard";
import { Stage } from "@/components/briefing/Stage";
import { maybeAutoTour, startTour } from "@/lib/tour";
import { BadgeKey, StateBadge } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { OtherAssetsRows } from "@/components/OtherAssets";
import { cryptoTotal } from "@/lib/crypto";
import { ApiProblem, Loading } from "@/components/Problem";
import { StartFlow } from "@/components/Today";
import { api, type CompanyDetail, type ExposureRow, type FundInfo, type PortfolioOut, type Status } from "@/lib/api";
import { approxMoney, money, pct, shortDate } from "@/lib/format";
import { NO_HOLDINGS, SAMPLE_PORTFOLIO, useHoldings } from "@/lib/holdings";
import { portfolioExtras, useOtherAssets } from "@/lib/other-assets";
import { liteSummary, proSummary } from "@/lib/words";

const SPARK_DAYS = 30;
const FUND_SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };

/** A section of the board: its header in the kicker style, its subtotal on the right, then its rows. */
function Section({ label, sum, className, children }: { label: string; sum: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`stack${className ? ` ${className}` : ""}`} style={{ gap: 10, marginTop: 22 }}>
      <div className="pf-sec"><span className="kicker">{label}</span><span className="pf-sec-sum">{sum}</span></div>
      {children}
    </div>
  );
}

// Brief: "analyze their existing portfolio" · "understanding what they own" · "make decisions". Owner: total,
// then the holdings list, then everything else — no duplicate totals, no detour before you can see the number.
export default function HoldingsBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sparks, setSparks] = useState<Record<string, CompanyDetail["prices"]>>({});
  const [holdings, setHoldings] = useHoldings(status ? (status.data === "sample" ? SAMPLE_PORTFOLIO : NO_HOLDINGS) : null);

  useEffect(() => {
    api.status().then(setStatus).catch(setError);
  }, []);

  // The saved-data demo plays the tour once on a first visit, once the board is on screen.
  useEffect(() => {
    if (board) maybeAutoTour();
  }, [board]);

  const other = useOtherAssets();
  const extras = JSON.stringify(portfolioExtras(other)); // changes when a home or 401(k) fund is added or removed
  useEffect(() => {
    if (!holdings?.length) return;
    api.portfolio(holdings, JSON.parse(extras)).then(setBoard).catch(setError);
  }, [holdings, extras]);

  // 401(k)/IRA funds by ticker. They join the look-through list but have no company page and no price series.
  const retire = new Map((board?.retirement ?? []).filter((r) => r.ticker).map((r) => [r.ticker as string, r]));

  // 30 trading days of closes per row, from the company endpoint (the same prices the company page charts).
  const symbols = board?.exposure.filter((e) => !retire.has(e.symbol)).map((e) => e.symbol).join(",") ?? "";
  useEffect(() => {
    if (!symbols) return;
    Promise.all(symbols.split(",").map((t) => api.company(t).then((d) => [t, d.prices.slice(-SPARK_DAYS)] as const).catch(() => null)))
      .then((pairs) => setSparks(Object.fromEntries(pairs.filter((p) => p !== null))));
  }, [symbols]);

  // A mapped 401(k) fund moves with the fund it behaves like (FXAIX with SPY). Its 1-day change, unless you hold it too.
  const standIns = [...new Set((board?.retirement ?? []).map((r) => r.behaves_like).filter((b): b is string => !!b))]
    .filter((b) => !board?.rows.some((r) => r.symbol === b)).join(",");
  const [standIn, setStandIn] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (!standIns) return;
    Promise.all(standIns.split(",").map((b) => api.fund(b).then((f) => [b, f.price?.change_1d ?? null] as const).catch(() => [b, null] as const)))
      .then((pairs) => setStandIn(Object.fromEntries(pairs)));
  }, [standIns]);

  if (error) return <ApiProblem />;
  if (holdings && !holdings.length) return <StartFlow />;
  if (!board) return <Loading what="what you own" />;

  // What a look-through row is: one of your rows' kinds, a 401(k)/IRA fund, or a stock you hold only inside a fund.
  const kindOf = (sym: string) => board.rows.find((r) => r.symbol === sym)?.kind ?? (retire.has(sym) ? "retirement" : "stock");
  const watching = board.exposure.filter((e) => e.state === "WATCH").length; // Pro: every look-through row
  const splitFunds = board.funds.filter((f) => f.looked_through > 0);
  const privateRows = board.private_funds ?? []; // BREIT / BCRED: in the total, priced monthly, not in the day change
  // Today's move over everything with a daily price: each holding's own 1-day change, and each mapped 401(k)/IRA fund
  // at the change of the fund it behaves like. A home has no daily price, so it's left out. Only when every priced
  // thing has a change, so it's never a partial sum.
  const changeOf = (sym: string) => board.rows.find((r) => r.symbol === sym)?.change ?? standIn[sym] ?? null;
  const priced = [
    ...board.rows.map((r) => ({ value: r.value, change: r.change })),
    ...(board.retirement ?? []).filter((r) => r.behaves_like).map((r) => ({ value: r.amount, change: changeOf(r.behaves_like as string) })),
  ];
  const pricedNow = priced.reduce((a, x) => a + x.value, 0);
  const todayMove = priced.length > 0 && priced.every((x) => x.change != null)
    ? priced.reduce((a, x) => a + x.value - x.value / (1 + (x.change as number)), 0) : null;
  const todayRel = todayMove != null && pricedNow - todayMove ? todayMove / (pricedNow - todayMove) : null;

  // The one-line split: only the kinds you actually have money in.
  const stocksSum = board.rows.filter((r) => r.kind === "stock").reduce((a, r) => a + r.value, 0);
  const fundsSum = board.rows.filter((r) => r.kind === "etf").reduce((a, r) => a + r.value, 0);
  const privateSum = board.subtotals?.private_funds ?? 0;
  const privateLabel = privateRows.length ? privateRows.map((r) => r.fund).join(" & ") : "Private funds";
  const cryptoSum = cryptoTotal(other.crypto); // at the Sep 25 closes (lib/crypto.ts), labelled so on every row
  const ownRow = (r: PortfolioOut["rows"][number]) => {
    const e = board.exposure.find((x) => x.symbol === r.symbol);
    return e ? <HoldingRow key={`own-${r.symbol}`} e={e} kind={r.kind} value={r.value} change={r.change} spark={sparks[r.symbol]} /> : null;
  };
  const split: [string, number, boolean?][] = ([
    ["Stocks", stocksSum], ["Funds", fundsSum], ["Crypto", cryptoSum], ["401(k)", board.subtotals?.retirement ?? 0],
    ["Home", board.subtotals?.home_estimate ?? 0, true], [privateLabel, board.subtotals?.private_funds ?? 0],
  ] as [string, number, boolean?][]).filter(([, v]) => v > 0);

  return (
    <section>
      <div className="pf-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker">Everything you own</span>
          <div className="pf-total">{money((board.subtotals?.total ?? board.total) + cryptoSum)}</div>
          {(board.subtotals?.includes_home_estimate || cryptoSum > 0) && (
            <p className="note">{[board.subtotals?.includes_home_estimate && "Includes a home estimate", cryptoSum > 0 && "crypto at the Sep 25 close (Alpaca)"]
              .filter(Boolean).join(" · ").replace(/^c/, (c) => (board.subtotals?.includes_home_estimate ? c : "C"))}</p>
          )}
          {todayMove != null && (
            <p className="sc-change">
              <span className={todayMove < 0 ? "down" : "up"}>{todayMove < 0 ? "−" : "+"}{money(Math.abs(todayMove))} ({pct(todayRel, true, todayRel != null && Math.abs(todayRel) < 0.001 ? 2 : 1)})</span>
              <span className="mute lite-only"> at the last close</span>
              <span className="mute pro-only"> {board.price_as_of ? `on ${shortDate(board.price_as_of)}` : "at the latest close"}</span>
            </p>
          )}
          {split.length > 0 && (
            <p className="note">{split.map(([label, v, approx]) => `${label} ${approx ? approxMoney(v) : money(v)}`).join(" · ")}</p>
          )}
        </div>
      </div>

      {watching > 0 && <BadgeKey />}
      {/* Lite: only what you entered, one row each at its full value, a link to its own page. Pro: the look-through
       *  list too (stocks inside your funds), each still one clean row and one link. */}
      {/* Everything you own in five sections, each with its subtotal: stocks, funds, crypto, real estate, 401(k).
       *  Pro lists stocks and funds in its look-through list below, so there those two headers stay out. */}
      {stocksSum > 0 && (
        <Section label="Stocks" sum={money(stocksSum)} className="lite-only">
          <div className="rows">{board.rows.filter((r) => r.kind !== "etf").map(ownRow)}</div>
        </Section>
      )}
      {(fundsSum > 0 || privateRows.length > 0) && (
        <Section label="Funds" sum={money(fundsSum + privateSum)} className={privateRows.length ? undefined : "lite-only"}>
          <div className="rows lite-only">{board.rows.filter((r) => r.kind === "etf").map(ownRow)}</div>
          <OtherAssetsRows rows={board.retirement ?? []} privateRows={privateRows} show="private" title={null} />
        </Section>
      )}
      <div className="rows pro-only pro-add">
        {board.exposure.map((e) => {
          const kind = kindOf(e.symbol);
          const row = board.rows.find((r) => r.symbol === e.symbol);
          return (
            <HoldingRow key={e.symbol} e={e} kind={kind} value={row?.value ?? e.total} change={changeOf(e.symbol)}
              spark={sparks[e.symbol]} behavesLike={retire.get(e.symbol)?.behaves_like ?? null} />
          );
        })}
      </div>

      <div className="stack" style={{ gap: 6, marginTop: 14 }}>
        <div className="stack pro-only pro-add" style={{ gap: 6 }}>
        {board.funds.map((f) => <FundLine key={f.symbol} f={f} />)}
        {splitFunds.length > 0 && (
          <p className="note">
            {splitFunds.map((f) => f.symbol).join(", ")} {splitFunds.length > 1 ? "are" : "is"} split into what {splitFunds.length > 1 ? "they hold" : "it holds"},
            so a stock you own through {splitFunds.length > 1 ? "those funds" : "that fund"} shows up here too.
          </p>
        )}
        </div>
        {board.unknown.length > 0 && <p className="badline">No data yet for {board.unknown.join(", ")}.</p>}
      </div>

      {other.crypto.length > 0 && (
        <Section label="Crypto" sum={money(cryptoSum)}>
          <OtherAssetsRows show="crypto" title={null} />
        </Section>
      )}
      {other.properties.length > 0 && (
        <Section label="Real estate" sum={board.subtotals?.home_estimate ? approxMoney(board.subtotals.home_estimate) : "—"}>
          <OtherAssetsRows show="home" title={null} />
        </Section>
      )}
      {other.retirement.length > 0 && (
        <Section label="401(k)" sum={money(board.subtotals?.retirement ?? 0)}>
          <OtherAssetsRows rows={board.retirement ?? []} show="retirement" title={null} />
        </Section>
      )}
      <OtherAssetsRows show="wallets" />

      {status?.data === "sample" && (
        <div className="row-flex" style={{ marginTop: 20 }}>
          <button className="linkb" type="button" onClick={() => setHoldings(SAMPLE_PORTFOLIO)}>Reset to the sample portfolio</button>
        </div>
      )}

      {/* Everything else: the compact briefing, how bumpy it's been, then (Pro) every dollar as a tile. */}
      <div className="pf-briefing" style={{ marginTop: 24 }}><Stage compact /></div>
      {holdings && holdings.length > 0 && <RiskCard holdings={holdings} />}
      <OwnMap board={board} />

      <div className="row-flex" style={{ gap: 20 }}>
        <button type="button" className="linkb" onClick={startTour}>Take the tour</button>
      </div>
    </section>
  );
}

type Row = PortfolioOut["rows"][number];

/** One board row: name, ticker, value, today's %, the badge, one plain line — a single link to the page that
 *  covers it. Stocks go to their company page, funds to their fund page, a mapped 401(k)/IRA to the fund it
 *  behaves like; a home, private fund or crypto has no page of its own here, so it isn't a link. */
function HoldingRow({ e, kind, value, change, spark, behavesLike }: {
  e: ExposureRow; kind: Row["kind"] | "retirement"; value: number; change: number | null; spark?: CompanyDetail["prices"]; behavesLike?: string | null;
}) {
  const isFund = kind === "etf";
  const isRetire = kind === "retirement";
  const isCrypto = kind === "crypto";
  const href = isFund ? `/fund/${e.symbol}` : isRetire ? (behavesLike ? `/fund/${behavesLike}` : null) : isCrypto ? null : `/company/${e.symbol}`;
  const oneLine = isCrypto ? "Crypto: no signals for it yet."
    : isFund || isRetire ? (e.firing.length ? liteSummary(e.firing, e.symbol) : "A fund: many stocks in one.")
    : liteSummary(e.firing, e.symbol);
  const body = (
    <>
      <span className="who">
        <span className="tk">{e.symbol}</span>
        <span className="nm">{e.name}</span>
        <span className="say">
          <span className="lite-only">{oneLine}</span>
          <span className="pro-only">{proSummary(e.firing)}</span>
        </span>
      </span>
      <span className={`sp ${spark && spark.length > 1 && spark[spark.length - 1].close < spark[0].close ? "down" : "up"}`}>
        {spark ? <Spark closes={spark.map((p) => p.close)} /> : <span className="spark" />}
      </span>
      <span className="val">
        {money(value)}
        <small className={change != null && change < 0 ? "down" : "up"}>{change != null ? pct(change) : ""}</small>
      </span>
      <span className="hend">
        <StateBadge state={e.state} />
        {href && <span className="chev" aria-hidden>›</span>}
      </span>
    </>
  );
  return href ? <Link href={href} className="hrow">{body}</Link> : <div className="hrow" style={{ cursor: "default" }}>{body}</div>;
}

function FundLine({ f }: { f: FundInfo }) {
  return (
    <p className="note">
      <Link href={`/fund/${f.symbol}`}><b>{f.symbol}</b></Link>:{" "}
      {f.as_of
        ? <>Holdings as of {shortDate(f.as_of)}, {FUND_SOURCES[f.source ?? ""] ?? f.source}.</>
        : "Not looked through yet: shown as the fund."}
    </p>
  );
}
