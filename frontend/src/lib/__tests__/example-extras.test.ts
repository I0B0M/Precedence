import { beforeEach, describe, expect, it, vi } from "vitest";

// The saved-data demo (the Netlify site): no server, so every example part comes from fixed values. SAVED is read
// when lib/api loads, so each test loads the modules fresh with it set. No localStorage in node: the store keeps
// its value in memory, which is the same code path a browser falls back to.
async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_STONE_SAVED", "1");
  const extras = await import("../example-extras");
  const store = await import("../other-assets");
  return { ...extras, ...store };
}

const parts = (v: import("../other-assets").OtherAssets) => ({
  homes: v.properties.map((p) => `${p.address} ${p.paid} ${Math.round(p.estimate?.estimate ?? 0)}`),
  funds: v.retirement.map((r) => `${r.account} ${r.name} ${r.amount}`),
  priv: v.privateFunds.map((f) => `${f.fund} ${f.amount}`),
  coins: v.crypto.map((c) => `${c.amount} ${c.symbol}`),
});
const WHOLE = {
  homes: ["33133 450000 935015"], funds: ["401(k) FXAIX 15000"], priv: ["BREIT 10000"], coins: ["0.05 BTC", "1.2 ETH", "150 LINK"],
};

describe("the example's home, 401(k), BREIT and crypto", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("are all added to an empty browser, once, however many times it's asked", async () => {
    const m = await load();
    await Promise.all([m.ensureExampleExtras(), m.ensureExampleExtras()]);
    await m.ensureExampleExtras();
    expect(parts(m.currentOtherAssets())).toEqual(WHOLE);
  });

  it("come back after the example is cleared and opened again (the old one-time flag kept them away)", async () => {
    const m = await load();
    await m.ensureExampleExtras();
    const v = m.currentOtherAssets();
    [...v.properties, ...v.retirement, ...v.crypto, ...v.privateFunds].forEach((x) => m.removeOther(x.id));
    expect(parts(m.currentOtherAssets())).toEqual({ homes: [], funds: [], priv: [], coins: [] });
    await m.ensureExampleExtras();
    expect(parts(m.currentOtherAssets())).toEqual(WHOLE);
  });

  it("fill in only the part that's missing", async () => {
    const m = await load();
    await m.ensureExampleExtras();
    m.removeOther(m.currentOtherAssets().properties[0].id);
    expect(m.exampleGaps(m.currentOtherAssets())).toEqual({ crypto: [], home: true, retirement: false, breit: false });
    await m.ensureExampleExtras();
    expect(parts(m.currentOtherAssets())).toEqual(WHOLE);
  });

  it("are never added beside something of your own", async () => {
    const m = await load();
    m.addProperty({ address: "10001", paid: 800000, bought: "2020", estimate: null });
    expect(m.exampleGaps(m.currentOtherAssets())).toBeNull();
    await m.ensureExampleExtras();
    expect(parts(m.currentOtherAssets())).toEqual({ homes: ["10001 800000 0"], funds: [], priv: [], coins: [] });
  });
});
