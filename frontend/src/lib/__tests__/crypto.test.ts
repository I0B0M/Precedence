import { describe, expect, it } from "vitest";
import { cryptoTotal, cryptoValue, EXAMPLE_CRYPTO } from "../crypto";

describe("crypto at the Sep 25 closes", () => {
  it("values the example's coins and adds them up", () => {
    expect(EXAMPLE_CRYPTO.map(cryptoValue)).toEqual([4204.28, 3228.9, 2088.98]);
    expect(cryptoTotal(EXAMPLE_CRYPTO)).toBeCloseTo(9522.16, 2);
  });

  it("gives no value, never a guess, for a coin with no close", () => {
    expect(cryptoValue({ symbol: "DOGE", amount: 1000 })).toBeNull();
    expect(cryptoTotal([{ symbol: "DOGE", amount: 1000 }, { symbol: "btc", amount: 0.1 }])).toBe(8408.55);
  });
});
