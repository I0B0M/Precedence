// Crypto on the board, at the Sep 25, 2026 daily closes from Alpaca's crypto market data (BTC/USD, ETH/USD, LINK/USD,
// the daily bar for that UTC day; the bars are kept in public/saved/crypto.json). Fixed, not live: every row says
// which close it is. A coin with no close here shows no value at all.

export const CRYPTO_CLOSES: Record<string, number> = { BTC: 84085.5, ETH: 2690.75, LINK: 13.9265 };
export const CRYPTO_SOURCE = "Close Sep 25 · Alpaca";
export const CRYPTO_NAMES: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", LINK: "Chainlink" };

/** The example portfolio's crypto: /import's "Try an example" adds these. */
export const EXAMPLE_CRYPTO = [
  { symbol: "BTC", amount: 0.05 },
  { symbol: "ETH", amount: 1.2 },
  { symbol: "LINK", amount: 150 },
];

/** Its value at that close, or null when there is none (then no dollar value is shown). */
export function cryptoValue(c: { symbol: string; amount: number }): number | null {
  const p = CRYPTO_CLOSES[c.symbol.toUpperCase()];
  return p == null ? null : Math.round(c.amount * p * 100) / 100;
}

export const cryptoTotal = (coins: { symbol: string; amount: number }[]) => coins.reduce((a, c) => a + (cryptoValue(c) ?? 0), 0);
