"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OtherAssetsForms } from "@/components/OtherAssets";
import { api, ApiError, type ReadRow, type Reconciled, type Status } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { saveHoldings } from "@/lib/holdings";

const CONNECT = [
  { name: "Robinhood", what: "Stocks and funds" },
  { name: "Binance", what: "Crypto" },
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

  const [priced, setPriced] = useState<{ symbol: string; day: string | null }[]>([]);
  const [unpriced, setUnpriced] = useState<string[]>([]);
  const [example, setExample] = useState<string | null>(null); // the close date, while example rows are in the table

  function applyExample(ex: Example | null) {
    if (!ex) return setCheckErr(true);
    setRows(ex.rows);
    setTotal(ex.total);
    setCheck(null);
    setCheckErr(false);
    setExample(ex.asOf);
  }
  const fillExample = () => loadExample().then(applyExample);

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
      // The API's own detail already says what went wrong (422 unreadable, 415 not an image, 413 too big, 502/503 reader down).
      // Only a failure to reach Stone at all gets our own wording.
      const known = e instanceof ApiError && [413, 415, 422, 502, 503].includes(e.status);
      setNote(known
        ? `${(e as ApiError).message} You can type the rows below instead.`
        : "Couldn't read that screenshot: Stone can't reach its data right now. Is the server running? You can type the rows below instead.");
    } finally {
      setBusy(false);
    }
  }

  async function runCheck(next = rows, nextTotal = total) {
    const kept = next.filter((r) => r.symbol.trim());  // drop blank rows so check.rows[i] lines up with rows[i]
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
    router.push("/");
  }

  const edit = (i: number, k: keyof EditRow, v: string) => {
    setExample(null);
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
        <p className="lede">Connect an account, or add a screenshot of any app. Stone only reads what you own; it can never trade or move money.</p>
      </div>

      {/* Connecting isn't built yet (no SnapTrade endpoint), so these stay disabled. Never fake a connection. */}
      <div className="card">
        <h3>Connect an account</h3>
        <div className="list">
          {CONNECT.map((c) => (
            <div key={c.name} className="list-row" style={{ alignItems: "center" }}>
              <span><b>{c.name}</b><span className="note" style={{ display: "block" }}>{c.what} · read-only</span></span>
              <button className="btn light small" type="button" disabled>Connecting opens soon</button>
            </div>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 8 }}>
        <h2>Your app isn&apos;t here? Add a screenshot</h2>
        <p className="mute">We read the rows, then check they add up to the total printed on your screen. If they don&apos;t, we find the misread
          before anything is saved.</p>
      </div>

      <div className="drop">
        <b>A screenshot from Cash App, Webull, Fidelity, anything</b>
        <label className={`btn${busy ? " is-busy" : ""}`}>
          <input className="sr-only" type="file" accept="image/*" disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {busy ? "Reading…" : "Choose a screenshot"}
        </label>
        {busy && <span className="note">Reading your screenshot…</span>}
        {note && <span className="badline">{note}</span>}
        {status?.data === "sample" && (
          <button className="linkb" type="button" onClick={tryExample}>Try the example (sample data, one blurry number)</button>
        )}
      </div>

      <div className="card">
        <h3>Check the rows</h3>
        <div className="row-flex" style={{ justifyContent: "space-between" }}>
          <p className="note">No screenshot? Type your holdings here instead.</p>
          <button className="btn light small" type="button" onClick={fillExample}>Try an example portfolio</button>
        </div>
        {example && (
          <p className="example-note"><b>Example holdings, not yours.</b> Real prices at the close on {shortDate(example)}. Nothing is saved until you press Save.</p>
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
        {check?.rows.filter((c) => c.problem).map((c, i) => (
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

        {checkErr && <div className="badline">Stone can&apos;t reach its data right now, so it can&apos;t check the rows. Is the server running?</div>}
        {priced.length > 0 && (
          <p className="note">Price filled in from the latest close: {priced.map((p) => `${p.symbol}${p.day ? ` (close ${shortDate(p.day)})` : ""}`).join(", ")}.</p>
        )}
        {unpriced.length > 0 && (
          <p className="badline">Stone has no price for {unpriced.join(", ")}. It follows the S&amp;P 100 and a few funds. Type a price and value for {unpriced.length > 1 ? "them" : "it"}, or remove the row.</p>
        )}
        {check && !(check.status === "no_total" && unpriced.length > 0) && (typedOk ? (
          <div className="okline">✓ No total to check against, so these rows add up to {money(check.rows_sum, true)}. Confirm they&apos;re right, then save.</div>
        ) : (
          <div className={check.status === "ok" ? "okline" : "badline"}>
            {check.status === "ok" ? "✓ " : ""}{check.message}
          </div>
        ))}
        <div className="row-flex">
          <button className="btn" type="button" disabled={!canSave} onClick={save}>Save as my holdings</button>
          {check && !canSave && <span className="note">Saving unlocks once every row has a value and they add up to the total.</span>}
        </div>
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 8 }}>
        <h2>Everything else you own</h2>
        <p className="mute">A home, a 401(k) or an IRA, crypto. Stone keeps what you type; values show only once there&apos;s a real estimate.</p>
      </div>
      <OtherAssetsForms />
    </section>
  );
}
