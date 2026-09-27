// Blackstone's non-traded funds (BREIT, BCRED): priced once a month from their own SEC filings, never daily.
// Shapes agreed with the data chat (2026-09-27); they move into api.ts when its commit lands.
import { api } from "./api";

export const PRIVATE_FUNDS = ["BREIT", "BCRED"] as const;
export type PrivateFundKey = (typeof PRIVATE_FUNDS)[number];

/** Classic's one line per fund, ≤10 words, no jargon. */
export const PRIVATE_LITE: Record<PrivateFundKey, string> = {
  BREIT: "Blackstone real estate fund. Priced monthly.",
  BCRED: "Blackstone private credit fund. Priced monthly.",
};

/** Pro: each fund's repurchase limit in our own words (from the terms quoted in its 10-Q), next to a link to the filing.
 *  The filing's own sentence is longer than a short quote, so it isn't reproduced. */
export const PRIVATE_LIQUIDITY: Record<PrivateFundKey, string> = {
  BREIT: "Repurchases are capped at 2% of the fund's value a month and 5% a quarter.",
  BCRED: "The fund may buy back up to 5% of its shares each quarter, at its Board's discretion.",
};

/** A filing quote is shown only when it's one short sentence (25 words or fewer). */
export const shortQuote = (t: string | null | undefined) => !!t && t.trim().split(/\s+/).length <= 25;

export const isPrivateFund = (s: string): s is PrivateFundKey => (PRIVATE_FUNDS as readonly string[]).includes(s.toUpperCase());

export interface PrivateFundIn { kind: "private_fund"; fund: PrivateFundKey; amount: number }

export interface PrivateFundRow {
  kind: "private_fund";
  fund: string;
  name: string;
  amount: number; // dollars the user entered
  nav: number | null;
  nav_as_of: string | null; // the month-end the NAV is for
  share_class: "I";
  shares: number | null; // amount / nav, for Pro
  nav_url: string | null; // the filing the NAV came from
  state: null; // no signals run on a monthly-priced fund
}

export interface PrivateFundPage {
  kind: "private_fund";
  symbol: string;
  name: string;
  sponsor: string;
  pricing: "monthly NAV";
  nav: { value: number; as_of: string; share_class: "I"; form: "424B3" | "8-K"; accession: string; url: string } | null;
  history: { as_of: string; nav: number; url: string }[]; // monthly, oldest first
  returns: { m1: number | null; m3: number | null; m12: number | null; basis: string }; // fractions
  invests_in: { text: string; url: string } | null; // quoted from its latest 10-Q
  liquidity_note: string | null; // the fund's own repurchase terms, quoted
  liquidity_url: string | null;
  filings: { form: string; accepted_at: string; url: string | null }[];
  holdings: [];
  source: string;
}

/** GET /api/funds/{BREIT|BCRED}: the same endpoint as ETFs, answering with kind "private_fund". */
export const privateFund = (s: string) => api.fund(s) as unknown as Promise<PrivateFundPage>;
