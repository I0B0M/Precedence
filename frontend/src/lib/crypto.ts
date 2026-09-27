// Crypto on the board, for now at EXAMPLE prices: fixed numbers so "everything you own in one place" includes it,
// never live. Every row that uses one says "Example price"; a coin with no example price shows no value at all.

export const EXAMPLE_CRYPTO_PRICES: Record<string, number> = { BTC: 64000, ETH: 3100, LINK: 14 };
export const CRYPTO_NAMES: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", LINK: "Chainlink" };

/** The example portfolio's crypto: /import's "Try an example" adds these. */
export const EXAMPLE_CRYPTO = [
  { symbol: "BTC", amount: 0.05 },
  { symbol: "ETH", amount: 1.2 },
  { symbol: "LINK", amount: 150 },
];

/** Its value at the example price, or null when there is none (then no dollar value is shown). */
export function cryptoValue(c: { symbol: string; amount: number }): number | null {
  const p = EXAMPLE_CRYPTO_PRICES[c.symbol.toUpperCase()];
  return p == null ? null : Math.round(c.amount * p * 100) / 100;
}

export const cryptoTotal = (coins: { symbol: string; amount: number }[]) => coins.reduce((a, c) => a + (cryptoValue(c) ?? 0), 0);
