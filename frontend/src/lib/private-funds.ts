// Blackstone's non-traded funds (BREIT, BCRED): priced once a month from their own SEC filings, never daily.
// The API types (PrivateFundIn / Row / Page) live in api.ts; this file adds the words and helpers around them.
import { api, type PrivateFundIn, type PrivateFundPage, type PrivateFundRow } from "./api";

export type { PrivateFundIn, PrivateFundPage, PrivateFundRow };

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

/** Classic: getting money out, in plain words. The filing link is Pro only. */
export const PRIVATE_WITHDRAW: Record<PrivateFundKey, string> = {
  BREIT: "You can't always sell: withdrawals are limited each month.",
  BCRED: "You can't always sell: buybacks are limited each quarter.",
};

/** A filing quote is shown only when it's one short sentence (25 words or fewer). */
export const shortQuote = (t: string | null | undefined) => !!t && t.trim().split(/\s+/).length <= 25;

/** Value per share as the filing states it, 2 to 4 decimals ($14.685, $23.60): never rounded to cents. */
export const navMoney = (v: number | null | undefined) =>
  v == null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const isPrivateFund = (s: string): s is PrivateFundKey => (PRIVATE_FUNDS as readonly string[]).includes(s.toUpperCase());


/** GET /api/funds/{BREIT|BCRED}: the same endpoint as ETFs, answering with kind "private_fund". */
export const privateFund = (s: string) => api.privateFund(s);

/** Classic, under the value per share: these funds pay income out, which the value series leaves out. */
export const PRIVATE_RETURN_NOTE = "Pays income out; value per share alone isn't your return.";
