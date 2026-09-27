"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { Why } from "@/components/Why";
import { api, ApiError, type FundLookup, type HomeEstimate, type RetirementRow } from "@/lib/api";
import { SHOW_CRYPTO, SHOW_PRIVATE_FUNDS } from "@/lib/flags";
import { PRIVATE_FUNDS, PRIVATE_LITE, type PrivateFundKey, type PrivateFundRow } from "@/lib/private-funds";
import { approxMoney, money, pct } from "@/lib/format";
import { addCrypto, addPrivateFund, addProperty, addRetirement, portfolioExtras, removeOther, useOtherAssets, type Property, type RetirementFund } from "@/lib/other-assets";

const num = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
};

/** "Behaves like the S&P 500" / "Close stand-in" / "Not tested", from the fund lookup (or the portfolio's row). */
function matchWords(match: FundLookup["match"] | undefined, behaves: string | null | undefined): string {
  if (match === "exact index" && behaves === "SPY") return "Behaves like the S&P 500";
  if (match === "close stand-in") return "Close stand-in";
  return "Not tested";
}
const shortMonth = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const LEVEL_WORDS: Record<string, string> = { zip5: "ZIP", county: "County", state: "State" };

/** Import page: add a home (estimated from FHFA prices), 401(k) / IRA funds (matched to an index), crypto when shown. */
export function OtherAssetsForms() {
  const [place, setPlace] = useState("");
  const [price, setPrice] = useState("");
  const [bought, setBought] = useState("");
  const [homeMsg, setHomeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [homeBusy, setHomeBusy] = useState(false);
  const [account, setAccount] = useState<RetirementFund["account"]>("401(k)");
  const [funds, setFunds] = useState([{ name: "", amount: "" }]);
  const [fundMsg, setFundMsg] = useState<string | null>(null);
  const [fundBusy, setFundBusy] = useState(false);
  const [coins, setCoins] = useState([{ symbol: "", amount: "" }]);
  const [coinsSaved, setCoinsSaved] = useState(false);
  const [pfFund, setPfFund] = useState<PrivateFundKey>("BREIT");
  const [pfAmount, setPfAmount] = useState("");
  const [pfSaved, setPfSaved] = useState<string | null>(null);

  const coinRows = coins.filter((c) => /^[A-Za-z0-9.]{2,10}$/.test(c.symbol.trim()) && num(c.amount) != null);
  // The FHFA index is yearly, so only the purchase year is asked for.
  const year = /^\d{4}$/.test(bought.trim()) ? Number(bought.trim()) : null;
  const homeOk = place.trim().length > 1 && num(price) != null && year != null && year >= 1975 && year <= new Date().getFullYear() && !homeBusy;
  const fundRows = funds.filter((f) => f.name.trim() && num(f.amount) != null);

  /** Ask for the estimate (an address, or a bare 5-digit ZIP), then save the home either way. */
  async function addHome() {
    setHomeBusy(true);
    setHomeMsg(null);
    const where = place.trim(), paid = num(price)!, y = year!;
    let estimate: HomeEstimate | null = null;
    let msg: { ok: boolean; text: string };
    try {
      estimate = await api.estimateHome({ ...(/^\d{5}$/.test(where) ? { zip: where } : { address: where }), paid, bought_year: y });
      msg = { ok: true, text: `About ${approxMoney(estimate.estimate)} · Estimate` };
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      // 400/422: the address couldn't be used; 502: the geocoder didn't answer. The API's own words say which.
      msg = status === 400 || status === 422 || status === 502
        ? { ok: false, text: `${(e as ApiError).message} Saved without an estimate.` }
        : { ok: false, text: "Estimate coming soon. Saved." };
    }
    addProperty({ address: where, paid, bought: String(y), estimate });
    setPlace(""); setPrice(""); setBought("");
    setHomeMsg(msg);
    setHomeBusy(false);
  }

  /** Look each fund up (which index it tracks), then save them. */
  async function addFunds() {
    setFundBusy(true);
    setFundMsg(null);
    const rows = await Promise.all(fundRows.map(async (f) => {
      // One retry: the first lookup of a fund can fail while the backend fetches it from the SEC.
      let lookup: FundLookup | null = null;
      for (let attempt = 0; attempt < 2 && !lookup; attempt++) {
        try {
          lookup = await api.lookupFund(f.name.trim());
        } catch {}
      }
      return { account, name: f.name.trim(), amount: num(f.amount)!, lookup };
    }));
    addRetirement(rows);
    setFunds([{ name: "", amount: "" }]);
    setFundMsg(rows.map((r) => `${r.lookup?.ticker ?? r.name}: ${matchWords(r.lookup?.match, r.lookup?.behaves_like)}`).join(" · "));
    setFundBusy(false);
  }

  return (
    <div className="grid2 even">
      <div className="card">
        <h3>Add a home</h3>
        <label className="list-head" htmlFor="h-place">Home address</label>
        <input id="h-place" className="field" value={place} autoComplete="street-address"
          onChange={(e) => { setPlace(e.target.value); setHomeMsg(null); }} placeholder="3900 Main Hwy, Miami, FL 33133" />
        <label className="list-head" htmlFor="h-price">What you paid</label>
        <input id="h-price" className="field" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setHomeMsg(null); }} placeholder="$" />
        <label className="list-head" htmlFor="h-when">Year you bought it</label>
        <input id="h-when" className="field" inputMode="numeric" maxLength={4} placeholder="2018" value={bought}
          onChange={(e) => { setBought(e.target.value.replace(/[^0-9]/g, "")); setHomeMsg(null); }} />
        <button className="btn" type="button" disabled={!homeOk} style={{ alignSelf: "flex-start" }} onClick={addHome}>
          {homeBusy ? "Estimating…" : "Add this home"}
        </button>
        {homeMsg && <p className={homeMsg.ok ? "okline" : "badline"}>{homeMsg.text}</p>}
        <p className="note">A ZIP code works too. An estimate, never a price.</p>
      </div>

      <div className="card">
        <h3>Add a <span style={{ textTransform: "none" }}>401(k)</span> or IRA</h3>
        <div className="seg-choice" role="group" aria-label="Account type">
          {(["401(k)", "IRA"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={account === a} onClick={() => setAccount(a)}>{a}</button>
          ))}
        </div>
        {funds.map((f, i) => (
          <div key={i} className="fund-row">
            <input className="field" aria-label={`Fund name ${i + 1}`} placeholder="Fund or ticker, e.g. FXAIX" value={f.name}
              onChange={(e) => { setFunds(funds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))); setFundMsg(null); }} />
            <input className="field" aria-label={`Amount ${i + 1}`} placeholder="$" inputMode="decimal" value={f.amount}
              onChange={(e) => { setFunds(funds.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))); setFundMsg(null); }} />
          </div>
        ))}
        <button className="linkb" type="button" onClick={() => setFunds([...funds, { name: "", amount: "" }])}>Add a fund</button>
        <button className="btn" type="button" disabled={!fundRows.length || fundBusy} style={{ alignSelf: "flex-start" }} onClick={addFunds}>
          {fundBusy ? "Looking up…" : `Add ${fundRows.length > 1 ? `${fundRows.length} funds` : "this fund"}`}
        </button>
        {fundMsg && <p className="okline">Saved. {fundMsg}</p>}
        <p className="note">A ticker like FXAIX works best.</p>
      </div>

      {SHOW_PRIVATE_FUNDS && <div className="card">
        <h3>Add a Blackstone fund</h3>
        <div className="seg-choice" role="group" aria-label="Fund">
          {PRIVATE_FUNDS.map((f) => (
            <button key={f} type="button" aria-pressed={pfFund === f} onClick={() => { setPfFund(f); setPfSaved(null); }}>{f}</button>
          ))}
        </div>
        <label className="list-head" htmlFor="pf-amount">What it&apos;s worth</label>
        <input id="pf-amount" className="field" inputMode="decimal" placeholder="$" value={pfAmount}
          onChange={(e) => { setPfAmount(e.target.value); setPfSaved(null); }} />
        <button className="btn" type="button" disabled={num(pfAmount) == null} style={{ alignSelf: "flex-start" }}
          onClick={() => { addPrivateFund(pfFund, num(pfAmount)!); setPfAmount(""); setPfSaved(pfFund); }}>Add {pfFund}</button>
        {pfSaved && <p className="okline">Saved. {pfSaved} is priced monthly from its SEC filings.</p>}
        <p className="note">{PRIVATE_LITE[pfFund]}</p>
      </div>}

      {SHOW_CRYPTO && <div className="card">
        <h3>Add crypto</h3>
        <p className="note">Symbol and how much you hold, as your wallet or exchange shows it. Fractions are fine (0.035).</p>
        {coins.map((c, i) => (
          <div key={i} className="fund-row">
            <input className="field" aria-label={`Crypto symbol ${i + 1}`} placeholder="BTC" value={c.symbol} autoCapitalize="characters"
              onChange={(e) => { setCoins(coins.map((x, j) => (j === i ? { ...x, symbol: e.target.value.toUpperCase() } : x))); setCoinsSaved(false); }} />
            <input className="field" aria-label={`Amount held ${i + 1}`} placeholder="0.035" inputMode="decimal" value={c.amount}
              onChange={(e) => { setCoins(coins.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))); setCoinsSaved(false); }} />
          </div>
        ))}
        <button className="linkb" type="button" onClick={() => setCoins([...coins, { symbol: "", amount: "" }])}>Add a coin</button>
        <button className="btn" type="button" disabled={!coinRows.length} style={{ alignSelf: "flex-start" }}
          onClick={() => { addCrypto(coinRows.map((c) => ({ symbol: c.symbol.trim().toUpperCase(), amount: num(c.amount)! }))); setCoins([{ symbol: "", amount: "" }]); setCoinsSaved(true); }}>
          Add {coinRows.length > 1 ? `${coinRows.length} coins` : "this coin"}
        </button>
        {coinsSaved && <p className="okline">Saved. It shows on your portfolio as &quot;Price coming soon&quot;.</p>}
        <p className="note">Precedence doesn&apos;t price crypto yet, so we keep what you typed and show no dollar value until it does.</p>
      </div>}
    </div>
  );
}

/** One home row: "About $X · Estimate" in Lite; the price change and the method in Pro / Why. */
function HomeRow({ p }: { p: Property }) {
  const e = p.estimate;
  const place = e?.address_matched ?? p.address;
  const where = e?.index_level === "zip5" ? `ZIP ${e.zip ?? ""}` : e?.index_level === "county" ? "County" : e?.index_level === "state" ? (e.us_state ?? "State") : "";
  const change = e && e.index_change != null && e.index_from
    ? `${where} prices ${e.index_change >= 0 ? "up" : "down"} ${pct(Math.abs(e.index_change), false, 0)} since ${e.index_from.year}`.trim()
    : null;
  return (
    <div className="hitem">
      <div className="hrow other">
        <span className="who">
        <span className="tk">Home</span><span className="nm">{place}</span>
        <span className="say">
          {e ? <>About {approxMoney(e.estimate)} · Estimate</> : "Estimate coming soon"}
          {change && <span className="pro-only note"> · {change} (FHFA)</span>}
          {e && (
            <Why what={`home estimate for ${place}`} source={e.source} asOf={e.as_of}
              rows={[
                ["Method", e.method],
                ...(change ? [["Change", change] as [string, string]] : []),
                ["Index", e.index_level ? `${LEVEL_WORDS[e.index_level] ?? e.index_level} series${e.index_from && e.index_to ? `, ${e.index_from.year} ${e.index_from.value} → ${e.index_to.year} ${e.index_to.value}` : ""}` : "—"],
                ["Located by", e.located_by === "address" ? `address, matched as ${e.address_matched ?? "—"} (${e.geocoder})` : `ZIP ${e.zip ?? "—"}`],
                ["Paid", `${money(e.paid)} in ${e.bought_year}`],
                ...(e.note ? [["Note", e.note] as [string, string]] : []),
              ]} />
          )}
        </span>
        <button className="linkb" type="button" onClick={() => removeOther(p.id)} aria-label={`Remove home at ${place}`} style={{ alignSelf: "flex-start" }}>Remove</button>
        </span>
        <span className="sp" aria-hidden />
        <span className="val">{e ? `About ${approxMoney(e.estimate)}` : "—"}<small className="mute">{e ? "estimate" : "coming soon"}</small></span>
        <span className="hend"><StateBadge state={null} /></span>
      </div>
    </div>
  );
}

/** Board: a home, 401(k) / IRA funds (and crypto, when shown). One line each in Lite; the working in Pro.
 *  `rows`: the board's own retirement rows, so the page doesn't ask the portfolio endpoint twice. */
export function OtherAssetsRows({ rows, privateRows = [] }: { rows?: RetirementRow[]; privateRows?: PrivateFundRow[] } = {}) {
  const all = useOtherAssets();
  const v = { ...all, crypto: SHOW_CRYPTO ? all.crypto : [], privateFunds: SHOW_PRIVATE_FUNDS ? all.privateFunds : [] };
  // Ask the stateless portfolio endpoint about just these rows, so each fund's badge is the backend's own state.
  const extras = portfolioExtras(v);
  const key = JSON.stringify(extras);
  const [got, setGot] = useState<{ key: string; rows: RetirementRow[] } | null>(null);
  useEffect(() => {
    const ask = portfolioExtras();
    if (rows || !ask.other?.some((o) => o.kind === "retirement")) return;
    api.portfolio([], ask).then((p) => setGot({ key, rows: p.retirement ?? [] })).catch(() => {});
  }, [key, rows]);
  const backend = rows ?? (got?.key === key ? got.rows : []);

  if (!v.properties.length && !v.retirement.length && !v.crypto.length && !v.privateFunds.length) return null;
  return (
    <div className="stack" style={{ gap: 10, marginTop: 24 }}>
      <span className="ticker">Also yours</span>
      <div className="rows">
        {v.properties.map((p) => <HomeRow key={p.id} p={p} />)}
        {v.retirement.map((r) => {
          const b = backend.find((x) => x.fund === (r.lookup?.ticker ?? r.name));
          const match = b?.match ?? r.lookup?.match ?? null;
          const behaves = b?.behaves_like ?? r.lookup?.behaves_like ?? null;
          return (
            <div key={r.id} className="hitem">
              <div className="hrow other">
                <span className="who">
                <span className="tk">{r.account}</span><span className="nm">{r.lookup?.name ?? r.name}</span>
                <span className="say">
                  {behaves && match === "exact index"
                    ? <Link href={`/fund/${behaves}`}>{r.lookup?.ticker ?? r.name} behaves like {behaves === "SPY" ? "the S&P 500" : behaves} ›</Link>
                    : matchWords(match, behaves)}
                  {r.lookup && (
                    <Why what={`${r.name} match`} source={r.lookup.source ?? undefined}
                      rows={[
                        ["Fund", `${r.lookup.ticker ?? r.name}${r.lookup.category ? ` · ${r.lookup.category}` : ""}`],
                        ["Match", match ? `${match}${behaves ? `, behaves like ${behaves}` : ""}` : "no index match"],
                        ...(r.lookup.basis ? [["Basis", r.lookup.basis] as [string, string]] : []),
                        ...(r.lookup.note ? [["Note", r.lookup.note] as [string, string]] : []),
                      ]} />
                  )}
                </span>
                <button className="linkb" type="button" onClick={() => removeOther(r.id)} aria-label={`Remove ${r.name}`} style={{ alignSelf: "flex-start" }}>Remove</button>
                </span>
                <span className="sp" aria-hidden />
                <span className="val">{money(r.amount)}<small className="mute">you entered</small></span>
                <span className="hend"><StateBadge state={b?.state ?? null} /></span>
              </div>
            </div>
          );
        })}
        {v.privateFunds.map((pf) => {
          const b = privateRows.find((x) => x.fund === pf.fund);
          return (
            <div key={pf.id} className="hitem">
              <div className="hrow other">
                <span className="who">
                  <span className="tk">{pf.fund}</span><span className="nm">{b?.name ?? pf.fund}</span>
                  <span className="say">
                    <Link href={`/fund/${pf.fund}`}>{PRIVATE_LITE[pf.fund]} ›</Link>
                    {b?.nav != null && (
                      <span className="pro-only note" style={{ display: "block" }}>
                        {money(b.nav, true)} a share (Class {b.share_class}){b.nav_as_of ? `, ${shortMonth(b.nav_as_of)}` : ""}
                        {b.shares != null ? ` · about ${b.shares.toLocaleString("en-US", { maximumFractionDigits: 1 })} shares` : ""}
                        {b.nav_url && <> · <a href={b.nav_url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}
                      </span>
                    )}
                  </span>
                  <button className="linkb" type="button" onClick={() => removeOther(pf.id)} aria-label={`Remove ${pf.fund}`} style={{ alignSelf: "flex-start" }}>Remove</button>
                </span>
                <span className="sp" aria-hidden />
                <span className="val">{money(pf.amount)}<small className="mute">priced monthly</small></span>
                <span className="hend"><StateBadge state={null} /></span>
              </div>
            </div>
          );
        })}
        {v.crypto.map((c) => (
          <div key={c.id} className="hitem">
            <div className="hrow other">
              <span className="who">
                <span className="tk">{c.symbol}</span><span className="nm">Crypto</span>
                <span className="say">{c.amount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {c.symbol} · Price coming soon</span>
                <button className="linkb" type="button" onClick={() => removeOther(c.id)} aria-label={`Remove ${c.symbol}`} style={{ alignSelf: "flex-start" }}>Remove</button>
              </span>
              <span className="sp" aria-hidden />
              <span className="val">Price<small className="mute">coming soon</small></span>
              <span className="hend"><StateBadge state={null} /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
