import type { FundLookup, HomeEstimate } from "./api";

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
