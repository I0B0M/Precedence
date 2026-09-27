"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OtherAssetsForms } from "@/components/OtherAssets";
import { SHOW_CRYPTO } from "@/lib/flags";
import { api, ApiError, type ReadRow, type Reconciled, type Status } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { saveHoldings } from "@/lib/holdings";

const CONNECT = [
  { name: "Robinhood", what: "Stocks and funds" },
  ...(SHOW_CRYPTO ? [{ name: "Binance", what: "Crypto" }] : []),
];

const EXAMPLE: [string, number][] = [["BX", 10], ["AMZN", 5], ["SPY", 3]];

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

type Example = { rows: EditRow[]; total: string; asOf: string | null };

/** Real tickers at their latest closes, with the matching total, so Check → Save takes two taps. Nothing is saved here. */
async function loadExample(): Promise<Example | null> {
  try {
    const cos = await api.companies();
    const picks = EXAMPLE.map(([t, sh]) => ({ c: cos.find((x) => x.ticker === t), sh })).filter((p) => p.c?.last_close != null);
    if (!picks.length) return null;
    const rows = picks.map(({ c, sh }) => ({ symbol: c!.ticker, shares: String(sh), price: c!.last_close!.toFixed(2), value: (sh * c!.last_close!).toFixed(2) }));
    return { rows, total: rows.reduce((a, r) => a + Number(r.value), 0).toFixed(2), asOf: picks[0].c!.as_of };
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
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false); // "Check" pressed with no rows

  const [priced, setPriced] = useState<{ symbol: string; day: string | null }[]>([]);
  const [unpriced, setUnpriced] = useState<string[]>([]);
  const [example, setExample] = useState<string | null>(null); // the close date, while example rows are in the table

  function applyExample(ex: Example | null) {
    if (!ex) return setCheckErr(true);
    setRows(ex.rows);
    setTotal(ex.total);
    setCheck(null);
    setCheckErr(false);
    setEmpty(false);
    setExample(ex.asOf);
  }
  // Fill the table, then bring it into view (the button sits at the top of the page).
  const fillAndShow = () => loadExample().then((ex) => {
    applyExample(ex);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => document.getElementById("check-rows")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 50);
  });

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    if (new URLSearchParams(window.location.search).get("example") === "1") loadExample().then(applyExample);
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.screenshot(file);
      setRows(r.rows.map(toEdit));
      setTotal(r.printed_total?.toString() ?? "");
      setCheck(r);
    } catch (e) {
      // 413/415/422: the API's own detail says what was wrong with the file. 502/503: the reader is down or not
      // connected; its detail names env vars and models, so it gets our wording, as does not reaching us at all.
      const status = e instanceof ApiError ? e.status : 0;
      setNote([413, 415, 422].includes(status)
        ? `${(e as ApiError).message} Type the rows below instead.`
        : status === 502 || status === 503
          ? "Screenshot reading is off right now. Type the rows below instead."
          : "Can't reach our server. Type the rows below instead.");
    } finally {
      setBusy(false);
    }
  }

  async function runCheck(next = rows, nextTotal = total) {
    const kept = next.filter((r) => r.symbol.trim());  // drop blank rows so check.rows[i] lines up with rows[i]
    setEmpty(!kept.length);
    if (!kept.length) return setCheck(null);
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
    setEmpty(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
    setCheck(null);
  };

  // Typed in with no screenshot total: nothing to reconcile against, so every row just needs a value.
  const typedOk = check?.status === "no_total" && check.rows.length > 0 && check.rows.every((r) => r.ok);
  const canSave = check?.status === "ok" || typedOk;

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="ticker">Add an account</span>
        <h1>Bring in what you own</h1>
        <p className="lede">Read-only. Never trades or moves money.</p>
      </div>

      {/* The quickest way in: real tickers at real closing prices, clearly labelled, nothing saved until Save. */}
      <div className="card" style={{ borderWidth: 2 }}>
        <h3>Example portfolio</h3>
        <p>BX, AMZN and SPY at real closing prices.</p>
        <button className="btn" type="button" onClick={fillAndShow} style={{ alignSelf: "flex-start" }}>Try an example portfolio</button>
      </div>

      {/* Connecting isn't built yet (no SnapTrade endpoint), so these stay disabled. Never fake a connection. */}
      <div className="card">
        <h3>Connect an account</h3>
        <div className="list">
          {CONNECT.map((c) => (
            <div key={c.name} className="list-row" style={{ alignItems: "center" }}>
              <span><b>{c.name}</b><span className="note" style={{ display: "block" }}>{c.what} · read-only</span></span>
              <button className="btn light small" type="button" disabled>Coming soon</button>
            </div>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 8 }}>
        <h2>Or add a screenshot</h2>
        <p className="mute">Checked against the total on your screen.</p>
      </div>

      <div className="drop">
        <b>Any app: Cash App, Webull, Fidelity…</b>
        <label className={`btn${busy ? " is-busy" : ""}`}>
          <input className="sr-only" type="file" accept="image/*" disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {busy ? "Reading…" : "Choose a screenshot"}
        </label>
        {note && <span className="badline">{note}</span>}
        {status?.data === "sample" && (
          <button className="linkb" type="button" onClick={tryExample}>Try the example (sample data, one blurry number)</button>
        )}
      </div>

      <div className="card" id="check-rows" style={{ scrollMarginTop: 110 }}>
        <h3>Check the rows</h3>
        <p className="note">Or type them: ticker and shares.</p>
        {example && (
          <p className="example-note"><b>Example, not yours.</b> Prices at the {shortDate(example)} close. Not saved until you press Save.</p>
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
          <label htmlFor="total"><b>Total shown on your screen</b></label>
          <input id="total" className="field" value={total} onChange={(e) => { setTotal(e.target.value); setCheck(null); }} inputMode="decimal"
            style={{ width: 160 }} />
          <button className="btn light" type="button" onClick={() => runCheck()}>Check it adds up</button>
        </div>

        {empty && <div className="badline">Add a ticker and shares first.</div>}
        {checkErr && <div className="badline">Can&apos;t reach our server. Try again.</div>}
        {priced.length > 0 && (
          <p className="note">Price from the latest close: {priced.map((p) => `${p.symbol}${p.day ? ` (${shortDate(p.day)})` : ""}`).join(", ")}.</p>
        )}
        {unpriced.length > 0 && (
          <p className="badline">No price for {unpriced.join(", ")}. Type a price, or remove the row.</p>
        )}
        {check && !(check.status === "no_total" && unpriced.length > 0) && (typedOk ? (
          <div className="okline">✓ Rows add up to {money(check.rows_sum)}. Check them, then save.</div>
        ) : (
          <div className={check.status === "ok" ? "okline" : "badline"}>
            {check.status === "ok" ? "✓ " : ""}{check.message}
          </div>
        ))}
        <div className="row-flex">
          <button className="btn" type="button" disabled={!canSave} onClick={save}>Save as my holdings</button>
          {check && !canSave && <span className="note">Needs a price on every row{total.trim() ? " and a matching total" : ""}.</span>}
        </div>
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 8 }}>
        <h2>Everything else you own</h2>
        <p className="mute">A home, a 401(k) or an IRA{SHOW_CRYPTO ? ", crypto" : ""}.</p>
      </div>
      <OtherAssetsForms />
    </section>
  );
}
