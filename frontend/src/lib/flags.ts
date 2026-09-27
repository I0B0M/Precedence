// Product switches. Crypto is v2 (Blackstone coaching: "our investors think in funds"), so nothing crypto is shown.
export const SHOW_CRYPTO = false;
// Robinhood connect isn't built (no SnapTrade endpoint). While off, pages show only the paths that work and one quiet
// line (comingNext in lib/features.ts). Screenshot reading follows status.screenshots instead. Never a disabled button.
export const SHOW_CONNECT = false;
// Lite wording on a STRONG result: the owner's call (judge walk #5 scores data honesty 4 with "mattered", 5 with
// "not-proven"). The badge and the rule (STRONG + firing = Heads up) are the same either way; only sentences change.
// "mattered": "This has mattered for AMZN before."  ·  "not-proven": "This has come before drops here. Not proven."
export const LITE_STRONG_WORDING: "mattered" | "not-proven" = "not-proven";
// BREIT / BCRED: on once the API accepts { kind: "private_fund" } in /api/portfolio and serves /api/funds/BREIT|BCRED.
// Off, nothing about them shows and nothing is sent, so an older API is never asked for rows it would reject.
export const SHOW_PRIVATE_FUNDS = true;
