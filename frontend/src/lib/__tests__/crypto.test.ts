import { describe, expect, it } from "vitest";
import { cryptoTotal, cryptoValue, EXAMPLE_CRYPTO } from "../crypto";

describe("crypto at example prices", () => {
  it("values the example's coins and adds them up", () => {
    expect(EXAMPLE_CRYPTO.map(cryptoValue)).toEqual([3200, 3720, 2100]);
    expect(cryptoTotal(EXAMPLE_CRYPTO)).toBe(9020);
  });

  it("gives no value, never a guess, for a coin with no example price", () => {
    expect(cryptoValue({ symbol: "DOGE", amount: 1000 })).toBeNull();
    expect(cryptoTotal([{ symbol: "DOGE", amount: 1000 }, { symbol: "btc", amount: 0.1 }])).toBe(6400);
  });
});
