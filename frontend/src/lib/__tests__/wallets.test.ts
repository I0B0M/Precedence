import { describe, expect, it } from "vitest";
import { shortWallet, walletLine, walletProblem } from "../wallets";

const ETH = "0x12a4b5c6d7e8f90a1b2c3d4e5f6a7b8c9d0e1fab";

describe("wallets: an address kept as it was pasted, no balance invented", () => {
  it("shortens an address the way wallets show it", () => {
    expect(shortWallet(ETH)).toBe("0x12…ab");
    expect(walletLine(ETH)).toBe("Wallet 0x12…ab · balance not loaded yet");
  });

  it("takes an address and refuses what isn't one", () => {
    expect(walletProblem(`  ${ETH} `)).toBeNull();
    expect(walletProblem("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBeNull();
    expect(walletProblem("")).toBe("Paste a wallet address.");
    expect(walletProblem("0x12 34")).toBe("That doesn't look like a wallet address: letters and numbers, no spaces.");
    expect(walletProblem("BTC")).toBe("That doesn't look like a wallet address: letters and numbers, no spaces.");
  });
});
