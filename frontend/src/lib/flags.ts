// Product switches. Crypto is v2 (Blackstone coaching: "our investors think in funds"), so nothing crypto is shown.
export const SHOW_CRYPTO = false;
// Robinhood connect isn't built (no SnapTrade endpoint). While off, pages show only the paths that work and one quiet
// line (comingNext in lib/features.ts). Screenshot reading follows status.screenshots instead. Never a disabled button.
export const SHOW_CONNECT = false;
// BREIT / BCRED: on once the API accepts { kind: "private_fund" } in /api/portfolio and serves /api/funds/BREIT|BCRED.
// Off, nothing about them shows and nothing is sent, so an older API is never asked for rows it would reject.
export const SHOW_PRIVATE_FUNDS = false;
