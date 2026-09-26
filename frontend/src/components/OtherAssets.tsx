"use client";

import { useState } from "react";
import { StateBadge } from "@/components/bits";
import { SHOW_CRYPTO } from "@/lib/flags";
import { money } from "@/lib/format";
import { addCrypto, addProperty, addRetirement, removeOther, useOtherAssets, type RetirementFund } from "@/lib/other-assets";

const num = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
};
const monthWords = (ym: string) => new Date(ym + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** Import page: add a home, or a 401(k) / IRA. Saved as typed; values come later from the backend. */
export function OtherAssetsForms() {
  const [place, setPlace] = useState("");
  const [price, setPrice] = useState("");
  const [bought, setBought] = useState("");
  const [homeSaved, setHomeSaved] = useState(false);
  const [account, setAccount] = useState<RetirementFund["account"]>("401(k)");
  const [funds, setFunds] = useState([{ name: "", amount: "" }]);
  const [fundsSaved, setFundsSaved] = useState(false);

  const [coins, setCoins] = useState([{ symbol: "", amount: "" }]);
  const [coinsSaved, setCoinsSaved] = useState(false);
  const coinRows = coins.filter((c) => /^[A-Za-z0-9.]{2,10}$/.test(c.symbol.trim()) && num(c.amount) != null);
  const homeOk = place.trim().length > 1 && num(price) != null && /^\d{4}-\d{2}$/.test(bought);
  const fundRows = funds.filter((f) => f.name.trim() && num(f.amount) != null);

  return (
    <div className="grid2 even">
      <div className="card">
        <h3>Add a home or property</h3>
        <label className="list-head" htmlFor="h-place">City and state, or ZIP</label>
        <input id="h-place" className="field" value={place} onChange={(e) => { setPlace(e.target.value); setHomeSaved(false); }} placeholder="Miami, FL or 33101" />
        <label className="list-head" htmlFor="h-price">What you paid</label>
        <input id="h-price" className="field" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setHomeSaved(false); }} placeholder="$" />
        <label className="list-head" htmlFor="h-when">When you bought it</label>
        <input id="h-when" className="field" type="month" value={bought} onChange={(e) => { setBought(e.target.value); setHomeSaved(false); }} />
        <button className="btn" type="button" disabled={!homeOk} style={{ alignSelf: "flex-start" }}
          onClick={() => { addProperty({ place: place.trim(), price: num(price)!, bought }); setPlace(""); setPrice(""); setBought(""); setHomeSaved(true); }}>
          Add this home
        </button>
        {homeSaved && <p className="okline">Saved. It shows on your portfolio as &quot;Estimate coming soon&quot;.</p>}
        <p className="note">Stone doesn&apos;t estimate home values yet, so we keep what you typed and show no value until an estimate with its source and date is ready.</p>
      </div>

      <div className="card">
        <h3>Add a <span style={{ textTransform: "none" }}>401(k)</span> or IRA</h3>
        <div className="seg-choice" role="group" aria-label="Account type">
          {(["401(k)", "IRA"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={account === a} onClick={() => setAccount(a)}>{a}</button>
          ))}
        </div>
        <p className="note">Type each fund&apos;s name and how much is in it, as your statement shows.</p>
        {funds.map((f, i) => (
          <div key={i} className="fund-row">
            <input className="field" aria-label={`Fund name ${i + 1}`} placeholder="Fund name" value={f.name}
              onChange={(e) => { setFunds(funds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))); setFundsSaved(false); }} />
            <input className="field" aria-label={`Amount ${i + 1}`} placeholder="$" inputMode="decimal" value={f.amount}
              onChange={(e) => { setFunds(funds.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))); setFundsSaved(false); }} />
          </div>
        ))}
        <button className="linkb" type="button" onClick={() => setFunds([...funds, { name: "", amount: "" }])}>Add a fund</button>
        <button className="btn" type="button" disabled={!fundRows.length} style={{ alignSelf: "flex-start" }}
          onClick={() => { addRetirement(fundRows.map((f) => ({ account, name: f.name.trim(), amount: num(f.amount)! }))); setFunds([{ name: "", amount: "" }]); setFundsSaved(true); }}>
          Add {fundRows.length > 1 ? `${fundRows.length} funds` : "this fund"}
        </button>
        {fundsSaved && <p className="okline">Saved. Funds show on your portfolio; matching them to an index comes next.</p>}
        <p className="note">A screenshot of a 401(k) statement: coming soon. The reader handles stock tickers today, not fund names.</p>
      </div>

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
        <p className="note">Stone doesn&apos;t price crypto yet, so we keep what you typed and show no dollar value until it does.</p>
      </div>}
    </div>
  );
}

/** Board: what you added that Stone can't value or test yet. Not counted in the total. */
export function OtherAssetsRows() {
  const all = useOtherAssets();
  const v = SHOW_CRYPTO ? all : { ...all, crypto: [] };
  if (!v.properties.length && !v.retirement.length && !v.crypto.length) return null;
  return (
    <div className="stack" style={{ gap: 10, marginTop: 24 }}>
      <span className="ticker">Also yours</span>
      <div className="rows">
        {v.properties.map((p) => (
          <div key={p.id} className="hitem">
            <div className="hrow other">
              <span><span className="tk">Home</span><span className="nm">{p.place}</span></span>
              <span className="say">Bought for {money(p.price)} in {monthWords(p.bought)}. Estimate coming soon.</span>
              <span className="val">Estimate<small className="mute">coming soon</small></span>
              <span className="hend"><StateBadge state={null} /><button className="linkb" type="button" onClick={() => removeOther(p.id)} aria-label={`Remove home in ${p.place}`}>Remove</button></span>
            </div>
          </div>
        ))}
        {v.retirement.map((r) => (
          <div key={r.id} className="hitem">
            <div className="hrow other">
              <span><span className="tk">{r.account}</span><span className="nm">{r.name}</span></span>
              <span className="say">{money(r.amount)}, as you entered it. Matching this fund to an index comes next.</span>
              <span className="val">{money(r.amount)}<small className="mute">you entered</small></span>
              <span className="hend"><StateBadge state={null} /><button className="linkb" type="button" onClick={() => removeOther(r.id)} aria-label={`Remove ${r.name}`}>Remove</button></span>
            </div>
          </div>
        ))}
        {v.crypto.map((c) => (
          <div key={c.id} className="hitem">
            <div className="hrow other">
              <span><span className="tk">{c.symbol}</span><span className="nm">Crypto</span></span>
              <span className="say">{c.amount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {c.symbol}, as you entered it. Price coming soon.</span>
              <span className="val">Price<small className="mute">coming soon</small></span>
              <span className="hend"><StateBadge state={null} /><button className="linkb" type="button" onClick={() => removeOther(c.id)} aria-label={`Remove ${c.symbol}`}>Remove</button></span>
            </div>
          </div>
        ))}
      </div>
      <p className="note">Not counted in your total yet. Stone shows a value only when it has an estimate with its source and date.</p>
    </div>
  );
}
