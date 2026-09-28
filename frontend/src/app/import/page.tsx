"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { OtherAssetsForms } from "@/components/OtherAssets";
import { SHOW_CRYPTO } from "@/lib/flags";
import { api, ApiError, EXAMPLE_PORTFOLIO, SAMPLE_SCREENSHOT, SAVED, type ReadRow, type Reconciled, type Status } from "@/lib/api";
import { andList, money, shortDate } from "@/lib/format";
import { saveHoldings } from "@/lib/holdings";
import { screenshotChoice, shotError } from "@/lib/importing";
import { NotRobinhoodCsv, readRobinhoodCsv, type RobinhoodRead } from "@/lib/robinhood";
import { walletLine, walletProblem } from "@/lib/wallets";
import { PRACTICE_CASH } from "@/lib/practice";
import { ensureExampleExtras } from "@/lib/example-extras";
import { addWallet, removeOther, useOtherAssets } from "@/lib/other-assets";

/** Fill what a person typing would leave out: price from the latest close, value from shares x price. */
async function fillTyped(rows: EditRow[]): Promise<{ rows: EditRow[]; priced: { symbol: string; day: string | null }[]; unpriced: string[] }> {
  const needPrice = rows.some((r) => r.price.trim() === "" && r.value.trim() === "");
  const cos = needPrice ? await api.companies() : [];
  const priced: { symbol: string; day: string | null }[] = [];
  const unpriced: string[] = [];
  const out = rows.map((r) => {
    let { price, value } = r;
    const sym = r.symbol.trim().toUpperCase();
    if (price.trim() === "" && value.trim() === "") {
      const c = cos.find((x) => x.ticker === sym);
      if (c?.last_close != null) {
        price = c.last_close.toFixed(2);
        priced.push({ symbol: sym, day: c.as_of });
      } else {
        unpriced.push(sym);
      }
    }
    const sh = num(r.shares), pr = num(price);
    if (value.trim() === "" && sh != null && pr != null) value = (sh * pr).toFixed(2);
    return { ...r, symbol: sym, price, value };
  });
  return { rows: out, priced, unpriced };
}

// check: the same reconcile "Check it adds up" runs, so its ✓ line shows at once; null on the saved-data demo, which can't run it.
type Example = { rows: EditRow[]; total: string; asOf: string | null; check: Reconciled | null };

/** Real tickers at their latest closes, with the matching total, already checked, so Save works in one tap. Nothing is saved here. */
async function loadExample(): Promise<Example | null> {
  try {
    const cos = await api.companies();
    const picks = EXAMPLE_PORTFOLIO.map(({ symbol: t, shares: sh }) => ({ c: cos.find((x) => x.ticker === t), sh })).filter((p) => p.c?.last_close != null);
    if (!picks.length) return null;
    const rows = picks.map(({ c, sh }) => ({ symbol: c!.ticker, shares: String(sh), price: c!.last_close!.toFixed(2), value: (sh * c!.last_close!).toFixed(2) }));
    const total = rows.reduce((a, r) => a + Number(r.value), 0).toFixed(2);
    const check = await api.reconcile(rows.map(toRead), Number(total)).catch(() => null);
    return { rows, total, asOf: picks[0].c!.as_of, check };
  } catch {
    return null;
  }
}

type EditRow = { symbol: string; shares: string; price: string; value: string };

const toEdit = (r: ReadRow): EditRow => ({
  symbol: r.symbol, shares: r.shares?.toString() ?? "", price: r.price?.toString() ?? "", value: r.value?.toString() ?? "",
});
const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s.replace(/[$,]/g, ""))) ? null : Number(s.replace(/[$,]/g, "")));
const toRead = (r: EditRow): ReadRow => ({ symbol: r.symbol.trim().toUpperCase(), shares: num(r.shares), price: num(r.price), value: num(r.value) });
const blank = (): EditRow => ({ symbol: "", shares: "", price: "", value: "" });

// Brief: "spread across different sources" · "understanding what they own"
export default function ImportScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<EditRow[]>([blank()]);
  const [total, setTotal] = useState("");
  const [check, setCheck] = useState<Reconciled | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checkErr, setCheckErr] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false); // saved-data demo: typed rows can't be checked without the server
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false); // "Check" pressed with no rows

  const [priced, setPriced] = useState<{ symbol: string; day: string | null }[]>([]);
  const [unpriced, setUnpriced] = useState<string[]>([]);
  const [example, setExample] = useState<string | null>(null); // the close date, while example rows are in the table
  const [sample, setSample] = useState(false); // the sample screen's rows are in the table, untouched
  const [statusFailed, setStatusFailed] = useState(false);
  const [rh, setRh] = useState<RobinhoodRead | null>(null); // the Robinhood file whose holdings are in the table
  const [rhNote, setRhNote] = useState<string | null>(null);
  const [wallet, setWallet] = useState("");
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const other = useOtherAssets();

  function applyExample(ex: Example | null) {
    if (!ex) return setCheckErr(true);
    setRows(ex.rows);
    setTotal(ex.total);
    setCheckErr(false);
    setEmpty(false);
    setExample(ex.asOf);
    setCheck(ex.check);
  }
  const showRows = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => document.getElementById("check-rows")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 50);
  };
  // Fill the table, then bring it into view (the button sits at the top of the page).
  const fillAndShow = () => loadExample().then((ex) => {
    setRh(null);
    applyExample(ex);
    ensureExampleExtras();
    showRows();
  });

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatusFailed(true));
    const q = new URLSearchParams(window.location.search);
    if (q.get("example") === "1") {
      loadExample().then(async (ex) => {
        applyExample(ex);
        await ensureExampleExtras();
        // The landing's "Open your portfolio" for a first visit: the whole example, saved, then straight to the board.
        if (ex && q.get("open") === "portfolio") {
          saveHoldings(ex.rows.map((r) => ({ symbol: r.symbol, shares: Number(r.shares) })));
          router.replace("/portfolio");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Read a screenshot (yours, or the sample screen) and check it adds up; the rows land in the table below. */
  async function readShot(read: () => Promise<Reconciled>, isSample: boolean) {
    setBusy(true);
    setNote(null);
    try {
      const r = await read();
      setRows(r.rows.length ? r.rows.map(toEdit) : [blank()]);
      setTotal(r.printed_total?.toString() ?? "");
      setCheck(r);
      setExample(null);
      setSample(isSample);
      setRh(null);
      showRows();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setNote(shotError(err?.status ?? 0, err?.message ?? "", choice, SAVED));
    } finally {
      setBusy(false);
    }
  }

  /** Robinhood's account activity CSV, read here in the browser: the shares it adds up to go into the table and
   *  through the same check as typed rows (priced from the latest close). */
  async function readRobinhood(file: File) {
    setRhNote(null);
    try {
      const read = readRobinhoodCsv(await file.text());
      setRh(read);
      if (!read.holdings.length) return setRhNote("No shares found in this file.");
      const next = read.holdings.map((h) => ({ symbol: h.symbol, shares: String(h.shares), price: "", value: "" }));
      setExample(null);
      setSample(false);
      setTotal("");
      setRows(next);
      showRows();
      await runCheck(next, "");
    } catch (e) {
      setRh(null);
      setRhNote(e instanceof NotRobinhoodCsv ? e.message : "That file couldn't be read.");
    }
  }

  function addWalletRow() {
    const problem = walletProblem(wallet);
    setWalletErr(problem);
    if (problem) return;
    addWallet(wallet);
    setWallet("");
  }

  async function runCheck(next = rows, nextTotal = total) {
    const kept = next.filter((r) => r.symbol.trim());  // drop blank rows so check.rows[i] lines up with rows[i]
    setEmpty(!kept.length);
    if (!kept.length) return setCheck(null);
    setSavedOnly(false);
    if (SAVED) {
      // The saved-data demo has no server to check against. The untouched example is the saved closes, so its rows
      // are added up here against its total; anything typed needs the full app.
      setCheckErr(false);
      if (!example) { setCheck(null); setSavedOnly(true); return; }
      const sum = Math.round(kept.reduce((a, r) => a + (num(r.value) ?? 0), 0) * 100) / 100;
      const tot = num(nextTotal), diff = tot == null ? null : Math.round((tot - sum) * 100) / 100;
      setCheck({
        status: diff == null ? "no_total" : Math.abs(diff) < 0.01 ? "ok" : "needs_review", rows_sum: sum, printed_total: tot, difference: diff,
        message: diff != null && Math.abs(diff) < 0.01 ? `Adds up to ${money(sum, true)}, the same total the screen shows.` : `Rows add up to ${money(sum, true)}.`,
        rows: kept.map((r) => ({ ...toRead(r), ok: true, problem: null, fix: {} })),
      });
      return;
    }
    try {
      setCheckErr(false);
      // Typed rows: a missing price comes from the latest close, a missing value is shares x price. "BX 10" must work.
      const filled = await fillTyped(kept);
      setRows(filled.rows.length ? filled.rows : [blank()]);
      setPriced(filled.priced);
      setUnpriced(filled.unpriced);
      setCheck(await api.reconcile(filled.rows.map(toRead), num(nextTotal)));
    } catch {
      setCheck(null);
      setCheckErr(true);
    }
  }

  /** Sample mode only: today's sample prices with one share count misread, like a blurry screenshot. */
  async function tryExample() {
    const cos = await api.companies();
    const price = (t: string) => cos.find((c) => c.ticker === t)?.last_close ?? 0;
    const truth: [string, number][] = [["HLCN", 62], ["MRDN", 140], ["ORCA", 30], ["BRVE", 55]];
    const read = truth.map(([t, sh]) => ({
      symbol: t, shares: (t === "BRVE" ? 85 : sh).toString(), price: price(t).toFixed(2), value: (sh * price(t)).toFixed(2),
    }));
    const printed = truth.reduce((a, [t, sh]) => a + Number((sh * price(t)).toFixed(2)), 0).toFixed(2);
    setRows(read);
    setTotal(printed);
    await runCheck(read, printed);
  }

  function applyFix(i: number) {
    const fix = check?.rows[i]?.fix;
    if (!fix) return;
    const next = rows.map((r, j) => (j !== i ? r : {
      ...r, ...(fix.shares != null ? { shares: String(fix.shares) } : {}), ...(fix.value != null ? { value: String(fix.value) } : {}),
    }));
    setRows(next);
    runCheck(next);
  }

  function save() {
    const holdings = rows.map(toRead).filter((r) => r.symbol).map((r) => ({
      symbol: r.symbol, shares: r.shares ?? (r.value != null && r.price ? r.value / r.price : 0),
    })).filter((h) => h.shares > 0);
    saveHoldings(holdings);
    router.push("/portfolio");
  }

  const edit = (i: number, k: keyof EditRow, v: string) => {
    setExample(null);
    setSample(false);
    setEmpty(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
    setCheck(null);
  };

  // Typed in with no screenshot total: nothing to reconcile against, so every row just needs a value.
  const typedOk = check?.status === "no_total" && check.rows.length > 0 && check.rows.every((r) => r.ok);
  // example: set while the example rows are untouched (any edit clears it), so they can be saved without the check.
  const canSave = check?.status === "ok" || typedOk || example != null;
  const typed = rows.some((r) => r.symbol.trim());
  const choice = screenshotChoice(status, SAVED); // upload, the sample only, or neither: from what the API says
  const shots = choice != null && choice.can !== "none";

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="ticker">Add what you own</span>
        <h1>Bring in what you own</h1>
        <p className="lede">Read-only. Never trades or moves money.</p>
      </div>

      {/* Every way in goes somewhere real: Robinhood's statement file, a screenshot (which says whether it can read
       *  yours, only the sample, or neither), a wallet address kept with no balance until one can be read, and
       *  practice money, one tap away. */}
      <div className="card">
        <h3>Bring your money in</h3>
        <p className="note">No account needed to start.</p>
        <div className="list">
          <a href="#robinhood" className="list-row" style={{ alignItems: "center", textDecoration: "none", color: "inherit" }}>
            <span><b>Robinhood</b><span className="note" style={{ display: "block" }}>Upload your Robinhood statement</span></span>
            <span className="chev" aria-hidden>›</span>
          </a>
          {shots ? (
            <a href="#screenshot-drop" className="list-row" style={{ alignItems: "center", textDecoration: "none", color: "inherit" }}>
              <span><b>Screenshot</b><span className="note" style={{ display: "block" }}>{choice.note}</span></span>
              <span className="chev" aria-hidden>›</span>
            </a>
          ) : (
            // No upload box to jump to: a link to #screenshot-drop (the onboarding's) lands here, on why not.
            <div className="list-row" id="screenshot-drop" style={{ alignItems: "center", scrollMarginTop: 110 }}>
              <span><b>Screenshot</b><span className="note" style={{ display: "block" }}>Any app, any account</span></span>
              <span className="note">{choice?.note ?? (statusFailed ? "Can't reach our server" : "Checking…")}</span>
            </div>
          )}
          <a href="#wallet" className="list-row" style={{ alignItems: "center", textDecoration: "none", color: "inherit" }}>
            <span><b>Crypto wallet</b><span className="note" style={{ display: "block" }}>Paste an address</span></span>
            <span className="chev" aria-hidden>›</span>
          </a>
          <Link href="/paper" className="list-row" style={{ alignItems: "center", textDecoration: "none", color: "inherit" }}>
            <span><b>Practice money</b><span className="note" style={{ display: "block" }}>Start with {money(PRACTICE_CASH)}</span></span>
            <span className="chev" aria-hidden>›</span>
          </Link>
        </div>
      </div>

      {/* The quickest way in that actually works today: real tickers at real closing prices, clearly labelled,
       *  nothing saved until Save. */}
      <div className="card" style={{ borderWidth: 2 }}>
        <h3>Example portfolio</h3>
        <p>{andList(EXAMPLE_PORTFOLIO.map((h) => h.symbol))} at real closing prices{SAVED ? "" : ", plus a 401(k), a home and a Blackstone fund"}.</p>
        <button className="btn" type="button" onClick={fillAndShow} style={{ alignSelf: "flex-start" }}>Try an example portfolio</button>
      </div>

      {shots && <>
      <div className="stack" style={{ gap: 12, marginTop: 8 }}>
        <h2>Or add a screenshot</h2>
        <p className="mute">Reads the screenshot, then checks it against the total on your screen.</p>
      </div>

      <div className="drop" id="screenshot-drop" style={{ scrollMarginTop: 110 }}>
        {choice.can === "upload" ? <>
          <b>Any app: Cash App, Webull, Fidelity…</b>
          <label className={`btn${busy ? " is-busy" : ""}`}>
            <input className="sr-only" type="file" accept="image/*" disabled={busy}
              onChange={(e) => e.target.files?.[0] && readShot(() => api.screenshot(e.target.files![0]), false)} />
            {busy ? "Reading…" : "Choose a screenshot"}
          </label>
        </> : <b>{choice.note}</b>}
        <button className={choice.can === "upload" ? "linkb" : `btn${busy ? " is-busy" : ""}`} type="button" disabled={busy}
          onClick={() => readShot(api.screenshotSample, true)}>
          {busy && choice.can !== "upload" ? "Reading…" : "Try it with a sample screenshot"}
        </button>
        {note && <span className="badline">{note}</span>}
        {status?.data === "sample" && (
          <button className="linkb" type="button" onClick={tryExample}>Try the example (sample data, one blurry number)</button>
        )}
      </div>
      </>}

      <div className="stack" id="robinhood" style={{ gap: 12, marginTop: 8, scrollMarginTop: 110 }}>
        <h2>Or upload your Robinhood statement</h2>
        <p className="mute">Robinhood&apos;s account activity report, as a CSV, from the day the account opened.
          Shares are counted from its buys, sells and splits.</p>
      </div>
      <div className="drop">
        <label className="btn">
          <input className="sr-only" type="file" accept=".csv,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readRobinhood(f); }} />
          Choose the CSV
        </label>
        <span className="note">Read in your browser. Only the tickers and share counts go on, to be priced and checked.</span>
        {rhNote && <span className="badline">{rhNote}</span>}
      </div>

      <div className="card" id="check-rows" style={{ scrollMarginTop: 110 }}>
        <h3>{shots ? "Check the rows" : "Type what you own"}</h3>
        <p className="note">Ticker and shares.</p>
        {example && (
          <p className="example-note"><b>Example, not yours.</b> Prices at the {shortDate(example)} close. Not saved until you press Save.</p>
        )}
        {rh && rh.holdings.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <p className="example-note"><b>From your Robinhood file.</b> {rh.holdings.length} holding{rh.holdings.length === 1 ? "" : "s"},
              counted from its activity{rh.from && rh.to ? ` from ${shortDate(rh.from)} to ${shortDate(rh.to)}` : ""}. Anything
              bought before the file starts isn&apos;t in it. Not saved until you press Save.</p>
            {rh.check.map((c) => <p key={`${c.symbol}-${c.why}`} className="note"><b>{c.symbol}:</b> {c.why}</p>)}
          </div>
        )}
        {sample && (
          <div className="sample-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SAMPLE_SCREENSHOT} width={780} height={1300}
              alt="The sample screen: a made-up Demo Broker account with BX, AMZN, NVDA, SPY and cash, total $18,236.86" />
            <p className="example-note"><b>Sample screen, not yours.</b> The rows below are what was read from it, then checked
              against its total. Not saved until you press Save.</p>
          </div>
        )}
        <div className="tscroll">
          <table className="readtable">
            <thead><tr><th>Ticker</th><th>Shares</th><th>Price</th><th>Value</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const c = check?.rows[i];
                return (
                  <tr key={i} className={c && !c.ok ? "bad" : undefined}>
                    {(["symbol", "shares", "price", "value"] as const).map((k) => (
                      <td key={k}>
                        <input aria-label={`${k} row ${i + 1}`} value={r[k]} onChange={(e) => edit(i, k, e.target.value)}
                          inputMode={k === "symbol" ? "text" : "decimal"} />
                      </td>
                    ))}
                    <td>
                      {c?.fix && Object.keys(c.fix).length > 0 && (
                        <button className="btn small hl" type="button" onClick={() => applyFix(i)}>
                          Use {c.fix.shares != null ? `${c.fix.shares} shares` : money(c.fix.value, true)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {check?.rows.filter((c) => c.problem && !unpriced.includes(c.symbol)).map((c, i) => (
          <p key={i} className="note"><b>{c.symbol}:</b> {c.problem}</p>
        ))}
        <div className="row-flex">
          <button className="linkb" type="button" onClick={() => setRows([...rows, blank()])}>Add a row</button>
        </div>
        <div className="row-flex">
          <label htmlFor="total"><b>Total your app shows</b> <span className="note">optional</span></label>
          <input id="total" className="field" value={total} onChange={(e) => { setTotal(e.target.value); setCheck(null); setExample(null); setSample(false); }} inputMode="decimal"
            style={{ width: 160 }} />
          <button className="btn light" type="button" onClick={() => runCheck()}>Check it adds up</button>
        </div>

        {empty && <div className="badline">Add at least one ticker and share count first.</div>}
        {checkErr && <div className="badline">Can&apos;t reach our server. Try again.</div>}
        {savedOnly && <div className="note">The add-up check needs the full app.</div>}
        {priced.length > 0 && (
          <p className="note">Price from the latest close: {priced.map((p) => `${p.symbol}${p.day ? ` (${shortDate(p.day)})` : ""}`).join(", ")}.</p>
        )}
        {unpriced.length > 0 && (
          <p className="badline">No price for {unpriced.join(", ")}. Type a price, or remove the row.</p>
        )}
        {check && !(check.status === "no_total" && unpriced.length > 0) && (typedOk ? (
          <div className="okline">✓ Rows add up to {money(check.rows_sum)}.</div>
        ) : (
          <div className={check.status === "ok" ? "okline" : "badline"}>
            {check.status === "ok" ? "✓ " : ""}{check.message}
          </div>
        ))}
        <div className="row-flex">
          <button className="btn" type="button" disabled={!canSave} onClick={save}>Save as my holdings</button>
          {!canSave && typed && (
            <span className="note">{check ? `Needs a price on every row${total.trim() ? " and a matching total" : ""}.` : "Press Check it adds up first."}</span>
          )}
        </div>
      </div>

      <div className="card" id="wallet" style={{ scrollMarginTop: 110 }}>
        <h3>Add a crypto wallet</h3>
        <p className="note">{SAVED ? "Needs the full app to read a wallet's balance."
          : "Its balance isn't loaded yet, so the wallet is kept with no value (and out of your total) until it can be."}</p>
        <div className="row-flex">
          <label htmlFor="wallet-address"><b>Wallet address</b></label>
          <input id="wallet-address" className="field" value={wallet} placeholder="0x…" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} onChange={(e) => { setWallet(e.target.value); setWalletErr(null); }}
            onKeyDown={(e) => e.key === "Enter" && addWalletRow()} style={{ flex: "1 1 16em", minWidth: 0 }} />
          <button className="btn light" type="button" onClick={addWalletRow} disabled={SAVED}>Add wallet</button>
        </div>
        {walletErr && <div className="badline">{walletErr}</div>}
        {other.wallets.length > 0 && (
          <div className="list">
            {other.wallets.map((w) => (
              <div key={w.id} className="list-row" style={{ alignItems: "center" }}>
                <span title={w.address}>{walletLine(w.address)}</span>
                <button className="linkb" type="button" onClick={() => removeOther(w.id)} aria-label={`Remove wallet ${w.address}`}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stack" id="other" style={{ gap: 12, marginTop: 8, scrollMarginTop: 110 }}>
        <h2>Everything else you own</h2>
        <p className="mute">A home, a 401(k) or an IRA{SHOW_CRYPTO ? ", crypto" : ""}.</p>
      </div>
      <OtherAssetsForms />
    </section>
  );
}
