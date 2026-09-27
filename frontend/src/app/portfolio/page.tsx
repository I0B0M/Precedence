"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Allocation } from "@/components/Allocation";
import { OwnMap } from "@/components/OwnMap";
import { RiskCard } from "@/components/RiskCard";
import { Stage } from "@/components/briefing/Stage";
import { maybeAutoTour, startTour } from "@/lib/tour";
import { BadgeKey, StateBadge, Verdict } from "@/components/bits";
import { Spark } from "@/components/HoldingsRail";
import { OtherAssetsRows } from "@/components/OtherAssets";
import { ApiProblem, Loading } from "@/components/Problem";
import { Why } from "@/components/Why";
import { StartFlow, TodayFunnel } from "@/components/Today";
import { api, type CompanyDetail, type ExposureRow, type FundInfo, type PortfolioOut, type RetirementRow, type Status } from "@/lib/api";
import { money, pct, sharePct, shortDate, whole } from "@/lib/format";
import { NO_HOLDINGS, SAMPLE_PORTFOLIO, useHoldings } from "@/lib/holdings";
import { portfolioExtras, useOtherAssets } from "@/lib/other-assets";
import { liteSummary, liteVerdict, proSummary } from "@/lib/words";

const SPARK_DAYS = 30;
const FUND_SOURCES: Record<string, string> = { ssga: "State Street (SSGA)", sample: "sample data" };

// Brief: "analyze their existing portfolio" · "understanding what they own" · "make decisions"
export default function HoldingsBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [board, setBoard] = useState<PortfolioOut | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
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
  // Everything you own, the home estimate included. Every "share of" on this page is out of this.
  const grand = board.subtotals?.total ?? board.total;
  const watching = board.exposure.filter((e) => e.state === "WATCH").length; // Pro: every look-through row
  // Lite counts only the rows Lite shows: what you hold, and your 401(k)/IRA funds. A stock seen only inside a fund
  // (META via SPY) is a Pro row, so it isn't in the Lite count.
  const liteFlagged = [
    ...board.rows.map((r) => board.exposure.find((e) => e.symbol === r.symbol)?.state ?? null),
    ...(board.retirement ?? []).map((r) => r.state),
  ].filter((s) => s === "WATCH").length;
  const stockRows = board.exposure.filter((e) => kindOf(e.symbol) === "stock");
  const splitFunds = board.funds.filter((f) => f.looked_through > 0);
  const privateRows = board.private_funds ?? []; // BREIT / BCRED: in the total, priced monthly, not in the day change
  const owned = board.rows.length + (board.retirement?.length ?? 0) + (board.properties?.length ?? 0) + privateRows.length;
  // Companies you hold, directly or inside funds, in all: stock rows plus the small slices folded inside each fund.
  const companies = stockRows.length + board.exposure.reduce((a, e) => a + e.children.length, 0);
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
  const mapped = (board.retirement ?? []).filter((r) => r.behaves_like && r.ticker);
  const unpriced = (board.retirement ?? []).filter((r) => !r.behaves_like);
  return (
    <section>
      <div className="pf-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker">Everything you own</span>
          <div className="pf-total">{money(board.subtotals?.total ?? board.total)}</div>
          {board.subtotals?.includes_home_estimate && <p className="note">Includes a home estimate</p>}
          {todayMove != null && (
            <p className="sc-change">
              <span className={todayMove < 0 ? "down" : "up"}>{todayMove < 0 ? "−" : "+"}{money(Math.abs(todayMove))} ({pct(todayRel, true, todayRel != null && Math.abs(todayRel) < 0.001 ? 2 : 1)})</span>
              <span className="mute lite-only"> at the last close</span>
              <span className="mute pro-only"> {board.price_as_of ? `on ${shortDate(board.price_as_of)}` : "at the latest close"}</span>
            </p>
          )}
          {todayMove != null && (mapped.length > 0 || unpriced.length > 0 || (board.properties?.length ?? 0) > 0 || privateRows.length > 0) && (
            <p className="note pro-only pro-add">
              Out of the {money(pricedNow)} with a daily price.
              {mapped.map((r) => ` ${r.ticker} moves with ${r.behaves_like}.`).join("")}
              {(board.properties?.length ?? 0) > 0 && " A home has no daily price, so it's left out."}
              {privateRows.length > 0 && ` ${privateRows.map((r) => r.fund).join(" and ")} ${privateRows.length > 1 ? "are" : "is"} priced monthly, so ${privateRows.length > 1 ? "they're" : "it's"} left out.`}
              {unpriced.length > 0 && ` ${unpriced.map((r) => r.fund).join(", ")}: no price, left out.`}
            </p>
          )}
          <p className="lede" style={{ color: "var(--text)" }}>
            <span className="lite-only">
              {liteFlagged ? `${liteFlagged} thing${liteFlagged > 1 ? "s" : ""} worth a look today.` : "Nothing needs you today."}
            </span>
            <span className="pro-only">
              {owned} thing{owned === 1 ? "" : "s"} you own · {companies} compan{companies === 1 ? "y" : "ies"} in all · {watching} on WATCH
            </span>
          </p>
        </div>
        <p className="note pro-only pro-add" style={{ maxWidth: "34ch" }}>
          WATCH = a STRONG pattern is happening now (see Why? for how it holds up).{" "}
          {todayMove == null && (board.price_as_of ? `Values at the ${shortDate(board.price_as_of)} close.` : "Values at the latest close.")}
        </p>
      </div>

      <div className="pf-briefing"><Stage /></div>
      <Allocation board={board} />
      <OwnMap board={board} />
      {holdings && holdings.length > 0 && <RiskCard holdings={holdings} />}
      <div className="row-flex" style={{ gap: 20 }}>
        <button type="button" className="linkb" onClick={startTour}>Take the tour</button>
      </div>

      <TodayFunnel symbols={(holdings ?? []).map((h) => h.symbol)} />

      {watching > 0 && <BadgeKey />}
      {/* Lite: only what you entered, one row each at its full value. Pro: the look-through list (stocks inside your funds too). */}
      <div className="rows lite-only">
        {board.rows.map((r) => {
          const e = board.exposure.find((x) => x.symbol === r.symbol);
          return e ? (
            <HoldingRow key={`own-${r.symbol}`} e={e} row={r} value={r.value} open={open === r.symbol} onToggle={() => setOpen(open === r.symbol ? null : r.symbol)}
              spark={sparks[r.symbol]} fund={board.funds.find((f) => f.symbol === r.symbol)} grand={grand} invest={board.total} />
          ) : null;
        })}
      </div>
      <div className="rows pro-only pro-add">
        {board.exposure.map((e) => (
          <HoldingRow key={e.symbol} e={e} row={board.rows.find((r) => r.symbol === e.symbol)} kind={kindOf(e.symbol)} open={open === e.symbol}
            onToggle={() => setOpen(open === e.symbol ? null : e.symbol)} spark={sparks[e.symbol]} retirement={retire.get(e.symbol)}
            fund={board.funds.find((f) => f.symbol === e.symbol)} grand={grand} invest={board.total} lookThrough />
        ))}
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

      <OtherAssetsRows rows={board.retirement ?? []} privateRows={privateRows} />

      {status?.data === "sample" && (
        <div className="row-flex" style={{ marginTop: 20 }}>
          <button className="linkb" type="button" onClick={() => setHoldings(SAMPLE_PORTFOLIO)}>Reset to the sample portfolio</button>
        </div>
      )}

    </section>
  );
}

type Row = PortfolioOut["rows"][number];

/** One board row. Lite passes `value` (the holding's full value as entered); the Pro look-through list shows what
 *  each exposure row stands for, and a fund's "shown as its stocks" note. */
function HoldingRow({ e, row, kind = row?.kind, value, open, onToggle, spark, fund, retirement, grand, invest, lookThrough = false }: {
  e: ExposureRow; row?: Row; kind?: string; value?: number; open: boolean; onToggle: () => void; spark?: CompanyDetail["prices"];
  fund?: FundInfo; retirement?: RetirementRow; grand: number; invest: number; lookThrough?: boolean;
}) {
  const id = `panel-${lookThrough ? "lt" : "own"}-${e.symbol}`;
  const fundLike = kind === "etf" || kind === "retirement";
  return (
    <div className={`hitem${open ? " open" : ""}`}>
      <button type="button" className="hrow" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="who">
          <span className="tk">{e.symbol}</span>
          <span className="nm">{e.name}</span>
          <span className="say">
            <span className="lite-only">{kind === "crypto" ? "Crypto: no signals for it yet." : fundLike && !e.firing.length ? "A fund: many stocks in one." : liteSummary(e.firing, e.symbol)}</span>
            <span className="pro-only">{proSummary(e.firing)}</span>
          </span>
        </span>
        <span className={`sp ${spark && spark.length > 1 && spark[spark.length - 1].close < spark[0].close ? "down" : "up"}`}>
          {spark ? <Spark closes={spark.map((p) => p.close)} /> : <span className="spark" />}
        </span>
        <span className="val">
          {value != null ? (
            <>
              {money(value)}
              <small className={row?.change != null && row.change < 0 ? "down" : "up"}>
                {row?.change != null ? `${pct(row.change)} at the last close` : ""}
              </small>
            </>
          ) : fundLike && e.direct - e.total >= 1 ? (
            // A looked-through fund: show what you own, and say how much of it appears as its stocks.
            <>
              {money(e.direct)}
              <small className="mute">{money(e.direct - e.total)} of it shown as its stocks on this list</small>
            </>
          ) : (
            <>
              {money(e.total)}
              <small className={row?.change != null && row.change < 0 ? "down" : "up"}>
                {row?.change != null ? `${pct(row.change)} ${row.kind === "crypto" ? "in 24h" : "today"}` : <span className="mute">{sharePct(grand ? e.total / grand : null)} of total</span>}
              </small>
            </>
          )}
        </span>
        <span className="hend">
          <StateBadge state={e.state} />
          <span className="chev" aria-hidden>›</span>
        </span>
      </button>
      <div className="hpanel" id={id} inert={!open}>
        <div><Panel e={e} kind={kind} fund={fund} retirement={retirement} grand={grand} invest={invest} /></div>
      </div>
    </div>
  );
}

function FundLine({ f }: { f: FundInfo }) {
  return (
    <p className="note">
      <Link href={`/fund/${f.symbol}`}><b>{f.symbol}</b></Link>:{" "}
      {f.as_of
        ? <>Holdings as of {shortDate(f.as_of)}, {FUND_SOURCES[f.source ?? ""] ?? f.source}.<span className="pro-only"> {whole(f.looked_through)} looked through.</span></>
        : "Not looked through yet: shown as the fund."}
    </p>
  );
}

/** Opens in place under a row: what's going on, and what it means for you in dollars. */
function Panel({ e, kind, fund, retirement, grand, invest }: {
  e: ExposureRow; kind?: string; fund?: FundInfo; retirement?: RetirementRow; grand: number; invest: number;
}) {
  const viaEtf = Object.values(e.via_etf).reduce((a, b) => a + b, 0);
  const isRetire = kind === "retirement"; // a 401(k)/IRA fund: no company page; its fund page is the one it behaves like
  const isFund = kind === "etf" || isRetire;
  const isCrypto = kind === "crypto"; // state null ("Not tested"); no company page, no signals
  // A fund row stands for only part of the fund (the rest shows as its stocks), so judge the whole fund from `direct`.
  const dollars = isFund ? e.direct : e.total;
  const share = grand ? dollars / grand : null;
  const investShare = invest && invest !== grand ? dollars / invest : null;
  const badDay = isFund ? (e.bad_day_return != null ? e.bad_day_return * e.direct : null) : e.bad_day_loss;
  const like = retirement?.behaves_like ?? null;
  const [allKids, setAllKids] = useState(false);
  const kids = allKids ? e.children : e.children.slice(0, 6);
  return (
    <div className="hdetail">
      <div className="stack" style={{ gap: 8 }}>
        <h3 className="pro-only">What&apos;s going on</h3>
        {isFund && (
          <p className="pro-only pro-add">
            {isRetire ? `A ${retirement?.account ?? "retirement"} fund. ${retirement?.note ?? ""}`
              : fund?.as_of ? `Holdings as of ${shortDate(fund.as_of)}.` : "Holdings not loaded yet."}
          </p>
        )}
        {isCrypto && <p>Crypto isn&apos;t covered by our signals yet, so there&apos;s nothing tested to report.</p>}
        {!isCrypto && (!isFund || e.firing.length > 0) && (
          <>
            {e.firing.length > 0 ? (
              <div className="list">
                {e.firing.map((s) => (
                  <div key={s.signal} className="list-row">
                    <span>
                      <span className="lite-only"><b>{s.lite}.</b> <span className="mute">{liteVerdict(s, e.symbol)}</span></span>
                      <span className="pro-only">{s.pro}</span>
                    </span>
                    <span className="pro-only"><Verdict s={s} /> <Why signal={s} what={`${e.symbol} ${s.pro}`} source="SEC EDGAR · FRED DGS10 · Alpaca IEX daily prices" /></span>
                  </div>
                ))}
              </div>
            ) : <p className="mute">Nothing important today.</p>}
          </>
        )}
        {e.children.length > 0 && (
          <div className="list pro-only pro-add">
            <p className="list-head">Smaller holdings inside {e.symbol} (under 1% each)</p>
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
        <h3 className="pro-only">What it means for you</h3>
        <dl className="kv">
          {e.direct > 0 && <><dt>You own directly</dt><dd>{money(e.direct)}</dd></>}
          {viaEtf > 0 && (<><dt>Inside your funds</dt><dd>{money(viaEtf)}
            <Why what={`${e.symbol} inside your funds`} rows={Object.entries(e.via_etf).map(([etf, v]) => [`Via ${etf}`, money(v)] as [string, string])}
              source="Fund holdings files (SPY: State Street)" /></dd></>)}
          {isFund && e.direct > e.total && (<><dt className="pro-only">Shown as its stocks</dt><dd className="pro-only">{money(e.direct - e.total)}</dd></>)}
          <dt className="pro-only">Share of everything you own</dt><dd className="pro-only">{sharePct(share)}</dd>
          {investShare != null && <><dt className="pro-only">Share of your investments</dt><dd className="pro-only">{sharePct(investShare)}</dd></>}
          <dt>A bad day could cost you</dt>
          <dd className="down">{money(badDay)}<span className="pro-only note"> ({pct(e.bad_day_return)})</span>
            <Why what={`${e.symbol} bad day`} source="Daily closes (Alpaca IEX)"
              rows={[["Basis", "5th-percentile daily return over the past year"], ["That day", pct(e.bad_day_return)], ["Applied to", money(dollars)]]} /></dd>
        </dl>
        <p className="note pro-only pro-add">Bad day: the worst 1 in 20 days, past year{isFund ? ", whole fund" : ""}.</p>
        {kind === "etf" && <Link className="linkb" href={`/fund/${e.symbol}`}>What&apos;s inside {e.symbol} ›</Link>}
        {isRetire && like && <Link className="linkb" href={`/fund/${like}`}>{e.symbol} behaves like {like === "SPY" ? "the S&P 500" : like} ›</Link>}
        {!isFund && !isCrypto && <Link className="linkb" href={`/company/${e.symbol}`}>Open {e.symbol} ›</Link>}
      </div>
    </div>
  );
}
