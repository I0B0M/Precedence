"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/bits";
import { Why } from "@/components/Why";
import { api, ApiError, SAVED, type FundLookup, type HomeEstimate, type RetirementRow } from "@/lib/api";
import { SHOW_CRYPTO, SHOW_PRIVATE_FUNDS } from "@/lib/flags";
import { shortWallet } from "@/lib/wallets";
import { CRYPTO_CLOSES, CRYPTO_NAMES, CRYPTO_SOURCE, cryptoValue } from "@/lib/crypto";
import { navMoney, PRIVATE_FUNDS, PRIVATE_LITE, PRIVATE_WITHDRAW, type PrivateFundKey, type PrivateFundRow } from "@/lib/private-funds";
import { approxMoney, money, pct } from "@/lib/format";
import { addCrypto, addPrivateFund, addProperty, addRetirement, portfolioExtras, removeOther, useOtherAssets, type Property, type RetirementFund } from "@/lib/other-assets";
import { isExample401k, isExampleBreit, isExampleCoin, isExampleHome } from "@/lib/example-extras";

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
  // A disabled button always says what it's waiting for, once something has been typed.
  const homeMissing = [
    place.trim().length > 1 ? null : "the address or ZIP",
    num(price) != null ? null : "what you paid",
    year != null && year >= 1975 && year <= new Date().getFullYear() ? null : "the year you bought it",
  ].filter(Boolean) as string[];
  const homeStarted = !!(place.trim() || price.trim() || bought.trim());
  const fundWaiting = !fundRows.length && funds.some((f) => f.name.trim() || f.amount.trim());

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
        {/* The saved-data demo has no server to estimate, look up or price with, so these say so rather than "Saved". */}
        {SAVED && <p className="note">Needs the full app: the estimate comes from our server.</p>}
        <button className="btn" type="button" disabled={!homeOk || SAVED} style={{ alignSelf: "flex-start" }} onClick={addHome}>
          {homeBusy ? "Estimating…" : "Add this home"}
        </button>
        {!SAVED && !homeOk && !homeBusy && homeStarted && homeMissing.length > 0 && (
          <p className="note">Add {homeMissing.length > 1 ? `${homeMissing.slice(0, -1).join(", ")} and ${homeMissing[homeMissing.length - 1]}` : homeMissing[0]}.</p>
        )}
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
        {SAVED && <p className="note">Needs the full app: the fund is matched on our server.</p>}
        <button className="btn" type="button" disabled={!fundRows.length || fundBusy || SAVED} style={{ alignSelf: "flex-start" }} onClick={addFunds}>
          {fundBusy ? "Looking up…" : `Add ${fundRows.length > 1 ? `${fundRows.length} funds` : "this fund"}`}
        </button>
        {!SAVED && fundWaiting && !fundBusy && <p className="note">Add the fund and the amount in it.</p>}
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
        {SAVED && <p className="note">Needs the full app: it&apos;s priced from its filings on our server.</p>}
        <button className="btn" type="button" disabled={num(pfAmount) == null || SAVED} style={{ alignSelf: "flex-start" }}
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

/** Where the home is: a 3×3 mosaic of OpenStreetMap tiles at zoom 17, centred on the Census geocoder's point, with a pin
 *  drawn in CSS. OSM's own tiles need no key; their licence asks for the visible credit, linked to its copyright page. */
function HomeMap({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const z = 17, n = 2 ** z;
  const X = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const cx = Math.floor(X), cy = Math.floor(Y);
  const px = (X - (cx - 1)) * 256, py = (Y - (cy - 1)) * 256; // the point, in the mosaic's own pixels
  return (
    <div className="home-map" role="img" aria-label={`Map of ${place}`}>
      <div className="home-tiles" style={{ left: `calc(50% - ${px.toFixed(1)}px)`, top: `calc(50% - ${py.toFixed(1)}px)` }}>
        {[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dx},${dy}`} alt="" src={`https://tile.openstreetmap.org/${z}/${cx + dx}/${cy + dy}.png`}
            width={256} height={256} style={{ left: (dx + 1) * 256, top: (dy + 1) * 256 }} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        )))}
      </div>
      <span className="home-pin" aria-hidden />
      <a className="home-attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
  );
}

/** One home: "Your home · address", about how much it's worth, what was paid and how local prices moved, and where
 *  it is on a map (address lookups only). Pro adds the method, the FHFA index values and the sources. */
function HomeRow({ p, fixed }: { p: Property; fixed: boolean }) {
  const e = p.estimate;
  const place = e?.address_matched ?? p.address;
  const area = e?.index_level === "zip5" ? "your ZIP" : e?.index_level === "county" ? "your county" : e?.index_level === "state" ? (e.us_state ?? "your state") : null;
  const about = e ? Math.round(e.estimate / 1000) * 1000 : null; // an estimate: never shown to the dollar
  return (
    <div className="hitem home-item">
      <div className="home-body">
        <div className="home-text">
          <span className="kicker">Your home · {place}</span>
          {e ? (
            <>
              <div className="home-value"><span className="home-num">About {money(about)}</span> <span className="label">Estimate</span></div>
              <p className="note">
                Bought for {money(e.paid)} in {e.bought_year}
                {area && e.index_change != null ? ` · home prices in ${area} are ${e.index_change >= 0 ? "up" : "down"} ${pct(Math.abs(e.index_change), false, 0)} since` : ""}
              </p>
              <p className="note pro-only pro-add">
                Method: {e.method}.
                {e.index_level && e.index_from && e.index_to && ` FHFA ${LEVEL_WORDS[e.index_level] ?? e.index_level} index ${e.index_from.year} ${e.index_from.value} → ${e.index_to.year} ${e.index_to.value}.`}
                {" "}Source: {e.source}{e.as_of ? ` (latest ${e.as_of})` : ""}. Located by {e.located_by === "address" ? `address (${e.geocoder})` : `ZIP ${e.zip ?? ""}`}.
                {e.note ? ` ${e.note}` : ""}
              </p>
            </>
          ) : <p>No estimate yet.</p>}
          {!fixed && <button className="linkb" type="button" onClick={() => removeOther(p.id)} aria-label={`Remove home at ${place}`} style={{ alignSelf: "flex-start" }}>Remove</button>}
        </div>
        {e?.lat != null && e?.lon != null ? <HomeMap lat={e.lat} lon={e.lon} place={place} /> : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="home-pic" src="/house.svg" alt="" width={240} height={180} />
        )}
      </div>
    </div>
  );
}

/** Board: a home, 401(k) / IRA funds (and crypto, when shown). One line each in Lite; the working in Pro.
 *  `rows`: the board's own retirement rows, so the page doesn't ask the portfolio endpoint twice.
 *  `show`: one kind only, so the board can put each under its own header (funds: 401(k)/IRA and private funds;
 *  home; rest: crypto and wallets); `title`: that header, or null for none (the page already shows one).
 *  `example`: the example is showing, so its own home, 401(k), BREIT and coins have no Remove (they'd come right back;
 *  "Clear it and add your own" is the way out). Anything you added beside them keeps its Remove. */
type Kind = "private" | "crypto" | "home" | "retirement" | "wallets";
export function OtherAssetsRows({ rows, privateRows = [], show, title = "Also yours", example = false }: {
  rows?: RetirementRow[]; privateRows?: PrivateFundRow[]; show?: Kind; title?: string | null; example?: boolean;
} = {}) {
  const all = useOtherAssets();
  const keep = (k: Kind) => !show || show === k;
  const v = {
    ...all,
    properties: keep("home") ? all.properties : [],
    retirement: keep("retirement") ? all.retirement : [],
    privateFunds: keep("private") && SHOW_PRIVATE_FUNDS ? all.privateFunds : [],
    crypto: keep("crypto") ? all.crypto : [], // at the Sep 25 closes, labelled on each row
    wallets: keep("wallets") ? all.wallets : [],
  };
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

  if (!v.properties.length && !v.retirement.length && !v.crypto.length && !v.privateFunds.length && !v.wallets.length) return null;
  return (
    <div className="stack" style={{ gap: 10, marginTop: title ? 24 : 0 }}>
      {title && <span className="ticker">{title}</span>}
      <div className="rows">
        {v.properties.map((p) => <HomeRow key={p.id} p={p} fixed={example && isExampleHome(p)} />)}
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
                {!(example && isExample401k(r)) && <button className="linkb" type="button" onClick={() => removeOther(r.id)} aria-label={`Remove ${r.name}`} style={{ alignSelf: "flex-start" }}>Remove</button>}
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
                    <span className="lite-only note" style={{ display: "block" }}>{PRIVATE_WITHDRAW[pf.fund]}</span>
                    {b?.nav != null && (
                      <span className="pro-only note" style={{ display: "block" }}>
                        {navMoney(b.nav)} a share (Class {b.share_class}){b.nav_as_of ? `, ${shortMonth(b.nav_as_of)}` : ""}
                        {b.shares != null ? ` · about ${b.shares.toLocaleString("en-US", { maximumFractionDigits: 1 })} shares` : ""}
                        {b.nav_url && <> · <a href={b.nav_url} target="_blank" rel="noopener noreferrer">sec.gov</a></>}
                      </span>
                    )}
                  </span>
                  {!(example && isExampleBreit(pf)) && <button className="linkb" type="button" onClick={() => removeOther(pf.id)} aria-label={`Remove ${pf.fund}`} style={{ alignSelf: "flex-start" }}>Remove</button>}
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
                <span className="tk">{c.symbol}</span><span className="nm">{CRYPTO_NAMES[c.symbol] ?? "Crypto"}</span>
                <span className="say">{c.amount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {c.symbol}
                  {CRYPTO_CLOSES[c.symbol] != null ? ` at ${money(CRYPTO_CLOSES[c.symbol])}` : ""}</span>
                {!(example && isExampleCoin(c)) && <button className="linkb" type="button" onClick={() => removeOther(c.id)} aria-label={`Remove ${c.symbol}`} style={{ alignSelf: "flex-start" }}>Remove</button>}
              </span>
              <span className="sp" aria-hidden />
              {cryptoValue(c) != null
                ? <span className="val">{money(cryptoValue(c))}<small className="mute">{CRYPTO_SOURCE}</small></span>
                : <span className="val">—<small className="mute">price not loaded</small></span>}
              <span className="hend"><StateBadge state={null} /></span>
            </div>
          </div>
        ))}
        {v.wallets.map((w) => (
          <div key={w.id} className="hitem">
            <div className="hrow other">
              <span className="who">
                <span className="tk">Wallet</span><span className="nm" title={w.address}>{shortWallet(w.address)}</span>
                <span className="say">Balance not loaded yet</span>
                <button className="linkb" type="button" onClick={() => removeOther(w.id)} aria-label={`Remove wallet ${w.address}`} style={{ alignSelf: "flex-start" }}>Remove</button>
              </span>
              <span className="sp" aria-hidden />
              <span className="val">—<small className="mute">not loaded yet</small></span>
              <span className="hend"><StateBadge state={null} /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
