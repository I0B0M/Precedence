import { api, SAVED, type FundLookup, type HomeEstimate } from "./api";
import { EXAMPLE_CRYPTO } from "./crypto";
import { SHOW_PRIVATE_FUNDS } from "./flags";
import { addCrypto, addPrivateFund, addProperty, addRetirement, currentOtherAssets, type OtherAssets } from "./other-assets";

// The example portfolio's other assets on the saved-data demo, which has no server to ask. These are the real API
// answers for the example's own inputs, saved as they came back from the live backend (Sep 27, 2026):
// POST /api/estimate/home {zip: "33133", paid: 450000, bought_year: 2018} and GET /api/funds/lookup?q=FXAIX.
// Live mode asks the API instead.

export const EXAMPLE_HOME_ESTIMATE: HomeEstimate = {
  kind: "property", located_by: "zip", address: null, address_matched: null, zip: "33133", county_fips: null, us_state: null,
  paid: 450000, bought_year: 2018, estimate: 935014.8455307803, index_change: 1.0778107678461781,
  index_from: { year: 2018, value: 1188.91 }, index_to: { year: 2025, value: 2470.33 }, index_level: "zip5", as_of: "2025",
  note: null, method: "paid × FHFA ZIP5 index change", source: "FHFA House Price Index, 5-digit ZIP (annual, developmental)",
  geocoder: null, state: null, lat: null, lon: null,
} as unknown as HomeEstimate;

export const EXAMPLE_FXAIX: FundLookup = {
  query: "FXAIX", ticker: "FXAIX", name: "Fidelity 500 Index Fund", category: "S&P 500 index", behaves_like: "SPY",
  match: "exact index", basis: "Benchmark: S&P 500 Index",
  source: "https://www.sec.gov/Archives/edgar/data/819118/000081911826000073/filing11574.htm", note: null,
} as unknown as FundLookup;

// The example's other assets, beside its stock rows. Fixed values: whenever the example is showing, each one is there.
export const EXAMPLE_HOME = { address: "33133", paid: 450000, bought: "2018" }; // same ZIP as the form's own placeholder
export const EXAMPLE_401K = { account: "401(k)" as const, name: "FXAIX", amount: 15000 }; // maps to the S&P 500
export const EXAMPLE_BREIT = { fund: "BREIT" as const, amount: 10000 };

export const isExampleHome = (p: OtherAssets["properties"][number]) => p.address === EXAMPLE_HOME.address && p.paid === EXAMPLE_HOME.paid;
export const isExample401k = (r: OtherAssets["retirement"][number]) => r.name === EXAMPLE_401K.name && r.amount === EXAMPLE_401K.amount;
export const isExampleBreit = (f: OtherAssets["privateFunds"][number]) => f.fund === EXAMPLE_BREIT.fund && f.amount === EXAMPLE_BREIT.amount;
export const isExampleCoin = (c: OtherAssets["crypto"][number]) => EXAMPLE_CRYPTO.some((e) => e.symbol === c.symbol && e.amount === c.amount);

/** Which of the example's parts are missing, or null when something saved isn't the example's (it's your own now). */
export function exampleGaps(v: OtherAssets) {
  const own = v.properties.some((p) => !isExampleHome(p)) || v.retirement.some((r) => !isExample401k(r))
    || v.privateFunds.some((f) => !isExampleBreit(f)) || v.crypto.some((c) => !isExampleCoin(c)) || v.wallets.length > 0;
  if (own) return null;
  return {
    crypto: EXAMPLE_CRYPTO.filter((e) => !v.crypto.some((c) => c.symbol === e.symbol)),
    home: !v.properties.length,
    retirement: !v.retirement.length,
    breit: SHOW_PRIVATE_FUNDS && !v.privateFunds.length,
  };
}

/** Add whichever example parts are missing. Checked against what's saved, not a flag, so clearing the example and
 *  opening it again brings them all back. Safe to call twice at once: each add is seen by the next check, and the
 *  live home estimate (the one wait) is asked for once. */
let homePending: Promise<void> | null = null;
export async function ensureExampleExtras() {
  const gaps = exampleGaps(currentOtherAssets());
  if (!gaps) return;
  if (gaps.crypto.length) addCrypto(gaps.crypto); // priced from fixed closes, no API: on the saved site too
  // The saved-data demo has no server, so it uses the live API's own answers saved above; live mode asks.
  if (gaps.retirement) addRetirement([{ ...EXAMPLE_401K, lookup: SAVED ? EXAMPLE_FXAIX : null }]);
  if (gaps.breit) addPrivateFund(EXAMPLE_BREIT.fund, EXAMPLE_BREIT.amount);
  if (!gaps.home) return;
  if (SAVED) return addProperty({ ...EXAMPLE_HOME, estimate: EXAMPLE_HOME_ESTIMATE });
  homePending ??= api.estimateHome({ zip: EXAMPLE_HOME.address, paid: EXAMPLE_HOME.paid, bought_year: Number(EXAMPLE_HOME.bought) })
    .then((estimate) => { if (exampleGaps(currentOtherAssets())?.home) addProperty({ ...EXAMPLE_HOME, estimate }); })
    .catch(() => {})
    .finally(() => { homePending = null; });
  return homePending;
}
