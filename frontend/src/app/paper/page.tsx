"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StateBadge } from "@/components/bits";
import { ApiProblem, Loading } from "@/components/Problem";
import { Why } from "@/components/Why";
import { api, type CompanyRow, type PortfolioOut } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { readHoldings } from "@/lib/holdings";
import { freshPractice, placeTrade, PRACTICE_CASH, resetPractice, tradeProblem, usePractice, type PracticeState } from "@/lib/practice";
import { liteSummary } from "@/lib/words";

type Side = "buy" | "sell";
type Draft = { side: Side; symbol: string; shares: number; price: number; day: string };

/** "from your portfolio", or how practice changed it: "10 from your portfolio + 2 practice". */
function seedWords(now: number, seed: number): string {
  if (Math.abs(now - seed) < 1e-9) return "from your portfolio";
  return now > seed ? `${sharesText(seed)} from your portfolio + ${sharesText(now - seed)} practice`
    : `${sharesText(seed)} from your portfolio, ${sharesText(seed - now)} sold in practice`;
}
const sharesText = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));

/** "Priced at Friday's close." Names the day only when the close is from an earlier day. */
function priceNote(day: string): string {
  const close = new Date(day + "T12:00:00");
  const today = new Date();
  const earlier = close.toDateString() !== today.toDateString() && close < today;
  return earlier ? `Priced at ${close.toLocaleDateString("en-US", { weekday: "long" })}'s close.` : "Priced at the latest close.";
}

// Brief: "make decisions" · "actionable". Practice only: nothing here reaches a broker.
export default function PracticeScreen() {
  const stored = usePractice();
  const [cos, setCos] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [boardFor, setBoardFor] = useState<{ key: string; data: PortfolioOut } | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("1");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    api.companies().then((c) => {
      setCos(c);
      // Arriving from Signals (?t=BX): start the ticket on that stock, if we have a price for it.
      const t = new URLSearchParams(window.location.search).get("t");
      if (t && c.some((x) => x.ticker === t && x.last_close != null)) setSymbol(t);
    }).catch(setError);
  }, []);

  // First visit: start from what the board holds, plus practice cash. Until the first practice trade, keep in step
  // with the board, so importing after a first look here still shows up.
  const fresh = cos ? freshPractice(readHoldings() ?? []) : null;
  const stale = !!stored && !!fresh && !stored.trades.length && JSON.stringify(stored.seeded ?? {}) !== JSON.stringify(fresh.seeded);
  const s: PracticeState | null = stored && !stale ? stored : fresh;
  useEffect(() => {
    if ((!stored || stale) && cos) resetPractice(readHoldings() ?? []);
  }, [stored, stale, cos]);

  const price = useMemo(() => new Map((cos ?? []).map((c) => [c.ticker, c])), [cos]);
  const posKey = s ? JSON.stringify(s.positions) : "";

  // CALM / WATCH for what practice holds, from the same endpoint as the board.
  useEffect(() => {
    if (!s) return;
    const holdings = Object.entries(s.positions).map(([sym, sh]) => ({ symbol: sym, shares: sh }));
    if (!holdings.length) return;
    const key = posKey;
    api.portfolio(holdings).then((data) => setBoardFor({ key, data })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey]);
  const board = boardFor?.key === posKey ? boardFor.data : null;

  if (error) return <ApiProblem />;
  if (!s || !cos) return <Loading what="practice" />;

  const pick = price.get(symbol);
  const shares = Number(qty);
  const problem = tradeProblem(s, side, symbol, shares, pick?.last_close ?? null);
  const invested = Object.entries(s.positions).reduce((a, [sym, sh]) => a + sh * (price.get(sym)?.last_close ?? 0), 0);
  const asOf = cos.find((c) => c.as_of)?.as_of ?? null;
  const held = Object.entries(s.positions).sort((a, b) => b[1] * (price.get(b[0])?.last_close ?? 0) - a[1] * (price.get(a[0])?.last_close ?? 0));

  function review() {
    if (problem || !pick?.last_close || !pick.as_of) return;
    setDone(null);
    setDraft({ side, symbol, shares, price: pick.last_close, day: pick.as_of });
  }
  function place() {
    if (!draft || !s) return;
    placeTrade(s, draft);
    // Sold the whole position: it leaves the sell list, so the ticket must not keep its symbol and price.
    if (draft.side === "sell" && draft.shares >= (s.positions[draft.symbol] ?? 0)) setSymbol("");
    setDone(`${draft.side === "buy" ? "Bought" : "Sold"} ${draft.shares} ${draft.symbol} (practice).`);
    setDraft(null);
  }

  return (
    <section className="stack" style={{ gap: 24 }}>
      <div className="practice-banner" role="note">Practice money. Not real. No order is ever sent.</div>
      <h1>{Object.keys(s.seeded ?? {}).length ? <>Your holdings plus {money(PRACTICE_CASH)} of pretend cash</> : <>Trade with {money(PRACTICE_CASH)} of pretend money</>}</h1>

      <div className="pf-head" style={{ margin: 0 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker">Pretend total</span>
          <div className="pf-total">{money(s.cash + invested)}</div>
          <p className="sc-change" style={{ fontWeight: 400 }}>{money(s.cash)} practice cash · {money(invested)} in {held.length} holding{held.length === 1 ? "" : "s"}</p>
        </div>
        {asOf && <p className="note" style={{ maxWidth: "36ch" }}>Prices: {shortDate(asOf)} close.</p>}
      </div>

      <div className="grid2">
        <div className="card ticket">
          <h3>{draft ? "Review" : "Make a practice trade"}</h3>
          {!draft ? (
            <>
              <div className="seg-choice" role="group" aria-label="Buy or sell">
                {(["buy", "sell"] as const).map((x) => (
                  <button key={x} type="button" aria-pressed={side === x} onClick={() => { setSide(x); setDone(null); if (x === "sell" && !(symbol in s.positions)) setSymbol(""); }}>{x === "buy" ? "Buy" : "Sell"}</button>
                ))}
              </div>
              <div className="t-row">
                <label htmlFor="p-stock">Stock</label>
                <select id="p-stock" className="select" value={symbol} onChange={(e) => { setSymbol(e.target.value); setDone(null); }}>
                  <option value="" disabled>Pick a stock</option>
                  {side === "sell"
                    ? held.map(([sym, sh]) => <option key={sym} value={sym}>{sym} · you hold {sharesText(sh)}</option>)
                    : cos.filter((c) => c.last_close != null).map((c) => <option key={c.ticker} value={c.ticker}>{c.ticker} · {c.name} · {money(c.last_close, true)}</option>)}
                </select>
              </div>
              <div className="t-row">
                <label htmlFor="p-qty">Whole shares</label>
                <input id="p-qty" className="field" inputMode="decimal" value={qty}
                  onChange={(e) => { setQty(e.target.value.replace(/[^0-9.]/g, "")); setDone(null); }} />
              </div>
              <dl className="t-sum">
                <dt>Price</dt>
                <dd>{pick?.last_close != null ? <>{money(pick.last_close, true)} <span className="note">close {pick.as_of ? shortDate(pick.as_of) : ""}</span>
                  <Why what={`${symbol} price`} source="Alpaca (IEX feed) daily close" asOf={pick.as_of}
                    rows={[["Used as", "the fill price for practice trades; no order is sent anywhere"]]} /></> : "—"}</dd>
                <dt>{side === "buy" ? "Estimated cost" : "Estimated proceeds"}</dt>
                <dd className="t-total">{pick?.last_close != null && shares > 0 && !problem ? money(shares * pick.last_close) : "—"}</dd>
              </dl>
              {symbol && problem && <p className="note down">{problem}</p>}
              <button className="btn t-go" type="button" disabled={!!problem} onClick={review}>Review trade</button>
            </>
          ) : (
            <div className="receipt" role="region" aria-label="Practice trade receipt">
              <p className="list-head">Receipt, before you place it</p>
              <dl className="kv">
                <dt>{draft.side === "buy" ? "Buy" : "Sell"}</dt><dd>{draft.shares} {draft.symbol}</dd>
                <dt>Price</dt><dd>{money(draft.price, true)} <span className="note">close {shortDate(draft.day)}</span></dd>
                <dt>{draft.side === "buy" ? "Cost" : "You get"}</dt><dd>{draft.shares} × {money(draft.price, true)} = {money(draft.shares * draft.price)}</dd>
                <dt>Practice cash left</dt><dd>{money(s.cash + (draft.side === "buy" ? -1 : 1) * draft.shares * draft.price)}</dd>
              </dl>
              <p className="note">{priceNote(draft.day)}</p>
              <button className="btn t-go" type="button" onClick={place}>Place practice trade</button>
              <button className="btn light t-go" type="button" onClick={() => setDraft(null)}>Back</button>
            </div>
          )}
          {done && <p className="okline" role="status">{done}</p>}
        </div>

        <div className="card">
          <h3>What practice holds</h3>
          {held.length ? (
            <div className="list">
              {held.map(([sym, sh]) => {
                const c = price.get(sym);
                const e = board?.exposure.find((x) => x.symbol === sym);
                return (
                  <Link key={sym} href={c?.kind === "etf" ? `/fund/${sym}` : `/company/${sym}`} className="list-row" style={{ alignItems: "center" }}>
                    <span>
                      <b>{sym}</b> <span className="mute">{sharesText(sh)} share{sh === 1 ? "" : "s"}</span>
                      {s.seeded?.[sym] != null && <>{" "}<span className="copied">{seedWords(sh, s.seeded[sym])}</span></>}
                      {e && <span className="note" style={{ display: "block" }}>{c?.kind === "etf" && !e.firing.length ? "A fund: many stocks in one." : liteSummary(e.firing, sym)}</span>}
                    </span>
                    <span className="row-flex" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <span>{money(sh * (c?.last_close ?? 0))}</span>
                      {e && <StateBadge state={e.state} />}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : <p className="mute">Nothing yet. Buy something with practice cash.</p>}
        </div>
      </div>

      {s.trades.length > 0 && (
        <div className="card">
          <h3>Practice trades</h3>
          <div className="list">
            {s.trades.map((t) => (
              <div key={t.at} className="list-row">
                <span>{t.side === "buy" ? "Bought" : "Sold"} {t.shares} {t.symbol} at {money(t.price, true)} <span className="mute">(close {shortDate(t.day)})</span></span>
                <span>{money(t.shares * t.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row-flex">
        {confirmReset ? (
          <>
            <span>Start over from what you own plus {money(PRACTICE_CASH)}?</span>
            <button className="btn small" type="button" onClick={() => { resetPractice(readHoldings() ?? []); setConfirmReset(false); setDraft(null); setDone(null); setSymbol(""); setQty("1"); }}>Yes, reset</button>
            <button className="btn light small" type="button" onClick={() => setConfirmReset(false)}>Keep it</button>
          </>
        ) : (
          <button className="btn light small" type="button" onClick={() => setConfirmReset(true)}>Reset practice</button>
        )}
      </div>

      <div className="next-step">
        <Link className="btn t-go" href="/portfolio">Open your portfolio</Link>
      </div>
    </section>
  );
}
