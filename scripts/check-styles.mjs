// Opens the four restyled pages and checks computed styles against design-study/stone-tokens.json,
// plus no horizontal scroll at 390/768/1280 and 44px tap targets on a phone. Exit 1 on any failure.
//
//   PW_DIR=/path/with/playwright node scripts/check-styles.mjs [base-url]
//
// Base URL defaults to http://localhost:3001 (the shared dev server). Playwright is not a project
// dependency; PW_DIR points at any folder where `npm i playwright` has been run.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const T = JSON.parse(readFileSync(here + "../design-study/stone-tokens.json", "utf8"));
const BASE = process.argv[2] ?? "http://localhost:3001";
const require = createRequire(process.env.PW_DIR ? process.env.PW_DIR.replace(/\/?$/, "/") : import.meta.url);
const { chromium } = require("playwright");

const DEMO = [{ symbol: "BX", shares: 20 }, { symbol: "AMZN", shares: 10 }, { symbol: "SPY", shares: 5 }, { symbol: "QQQ", shares: 3 }];
let fails = 0, passes = 0;
const ok = (cond, what, got) => {
  if (cond) passes++;
  else { fails++; console.log(`  ✗ ${what}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`); }
};
const eq = (got, want, what) => ok(got === want, `${what} = ${JSON.stringify(want)}`, got);

// Read computed styles in the page. Returns null for a missing element so the check fails loudly.
const style = (page, sel, props) => page.evaluate(([sel, props]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const o = { h: r.height, w: r.width };
  for (const p of props) o[p] = cs.getPropertyValue(p);
  return o;
}, [sel, props]);

async function common(page, w) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w, `no horizontal scroll at ${w}`, sw);
  const body = await style(page, "body", ["background-color", "font-family"]);
  eq(body?.["background-color"], T.color.bg, "body background");
  ok(body?.["font-family"].includes(T.font.body) || body?.["font-family"].includes("figtree"), "body font is Figtree", body?.["font-family"]);
  if (w <= 390) {
    const small = await page.evaluate((min) => [...document.querySelectorAll("main button, main select, main input, main .btn, main .linkb, main [role=tab], main [role=radio]")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })
      .filter((e) => { const r = e.getBoundingClientRect(); return r.height < min || r.width < min; })
      .map((e) => `${e.tagName.toLowerCase()} "${e.textContent.trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`), T.size.tap_min);
    ok(small.length === 0, `tap targets ≥${T.size.tap_min}px at ${w}`, small);
  }
}

const PAGES = [
  {
    name: "company", path: "/company/BX", ready: ".sc-svg",
    async check(page, w) {
      const phone = w <= 640;
      const h1 = await style(page, ".sc-title h1", ["font-size", "line-height", "font-family"]);
      eq(h1?.["font-size"], phone ? T.type.title_phone.size : T.type.title.size, "title size");
      eq(h1?.["line-height"], phone ? T.type.title_phone.line : T.type.title.line, "title line-height");
      ok(h1?.["font-family"].toLowerCase().includes("bricolage"), "title in Bricolage", h1?.["font-family"]);
      const pr = await style(page, ".sc-price", ["font-size", "line-height", "font-weight", "font-family"]);
      eq(pr?.["font-size"], phone ? T.type.price_phone.size : T.type.price.size, "price size");
      eq(pr?.["line-height"], phone ? T.type.price_phone.line : T.type.price.line, "price line-height");
      eq(pr?.["font-weight"], T.type.price.weight, "price weight");
      ok(pr?.["font-family"].toLowerCase().includes("bricolage"), "price in Bricolage", pr?.["font-family"]);
      const ch = await style(page, ".sc-change", ["font-size", "line-height"]);
      eq(ch?.["font-size"], T.type.change.size, "change size");
      eq(ch?.["line-height"], T.type.change.line, "change line-height");
      const dir = await style(page, ".sc-change > span:first-child", ["color"]);
      ok([T.color.up, T.color.down].includes(dir?.color), "change in up/down colour", dir?.color);
      const tab = await style(page, ".sc-ranges button", ["font-size", "font-weight", "letter-spacing"]);
      eq(tab?.["font-size"], T.type.tab.size, "range tab size");
      eq(tab?.["font-weight"], T.type.tab.weight, "range tab weight");
      eq(tab?.["letter-spacing"], T.type.tab.tracking, "range tab tracking");
      ok(tab?.h >= T.size.tap_min, "range tab ≥44px tall", tab?.h);
      const sel = await style(page, '.sc-ranges button[aria-selected="true"]', ["box-shadow"]);
      ok(sel?.["box-shadow"].includes(T.color.accent), "selected range underlined in accent", sel?.["box-shadow"]);
      const line = await page.evaluate(() => { const p = document.querySelector(".sc-svg path"); return p && getComputedStyle(p).strokeWidth; });
      eq(line, T.chart.stroke, "chart stroke");
      const kick = await style(page, ".sc-head .kicker", ["font-family", "font-size", "text-transform"]);
      ok(kick?.["font-family"].toLowerCase().includes("doto"), "label line in Doto", kick?.["font-family"]);
      eq(kick?.["font-size"], T.type.label.size, "label size");
      const marks = await page.evaluate(() => document.querySelectorAll(".sc-svg circle[r='4.5']").length);
      ok(marks > 0, "past-case marks drawn on the chart", marks);
      // range tabs actually change the range
      const before = await page.textContent(".sc-change");
      await page.click('.sc-ranges button:has-text("1M")');
      await page.waitForTimeout(150);
      ok((await page.textContent(".sc-change")) !== before, "1M tab changes the header change");
    },
  },
  {
    name: "board", path: "/", ready: ".hrow .spark path",
    async check(page, w) {
      const tot = await style(page, ".pf-total", ["font-size", "line-height", "font-family"]);
      eq(tot?.["font-size"], T.type.price.size, "total size");
      ok(tot?.["font-family"].toLowerCase().includes("bricolage"), "total in Bricolage", tot?.["font-family"]);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".hrow")].map((r) => r.getBoundingClientRect().height));
      ok(rows.length > 0 && rows.every((h) => h >= T.size.row_min), `every row ≥${T.size.row_min}px`, rows.filter((h) => h < 64));
      const sparks = await page.evaluate(() => document.querySelectorAll(".hrow .spark path").length);
      ok(sparks > 0, "rows have sparklines", sparks);
      if (w >= 1024) {
        const xs = await page.evaluate(() => [...new Set([...document.querySelectorAll(".hrow .sp")].map((s) => Math.round(s.getBoundingClientRect().x)))]);
        ok(xs.length === 1, "sparklines line up in one column", xs);
      }
      const fundLink = await page.evaluate(() => [...document.querySelectorAll('a[href^="/fund/"]')].length);
      ok(fundLink > 0, "fund rows link to /fund/[symbol]", fundLink);
      const badge = await style(page, ".badge.watch", ["background-color"]);
      if (badge) eq(badge["background-color"], T.color.accent, "Heads up badge in accent");
    },
  },
  {
    name: "lab", path: "/lab?t=BX&s=rate_jump", ready: ".verdict",
    async check(page) {
      const d = await page.evaluate(() => [...document.querySelectorAll(".hitdots i.h")].slice(0, 2).map((i) => ({ delay: getComputedStyle(i).animationDelay, bg: getComputedStyle(i).backgroundColor, idx: i.style.getPropertyValue("--i") })));
      ok(d.length === 2, "filled dots present", d.length);
      if (d.length === 2) {
        const step = parseFloat(d[1].delay) / Math.max(1, Number(d[1].idx)) ;
        ok(Math.abs(step - T.motion.dot_stagger_s) < 0.001, `dot stagger ${T.motion.dot_stagger_s}s`, d.map((x) => x.delay));
        eq(d[0].bg, T.color.accent, "filled dot colour");
      }
      await page.waitForTimeout(2500);
      const hit = await page.textContent(".lab-result .versus .bignum");
      const want = await page.getAttribute(".lab-result .versus .bignum", "aria-label");
      eq(hit?.trim(), want, "hit rate counts up to the API's rate");
      const after = await style(page, ".lab-after", ["animation-duration", "opacity"]);
      eq(after?.["animation-duration"], `${T.motion.reveal_s}s`, "normal fades in over 0.3s");
      eq(after?.opacity, "1", "normal visible after the reveal");
      const v = await style(page, ".verdict", ["opacity"]);
      eq(v?.opacity, "1", "verdict strip visible after the reveal");
    },
  },
  {
    name: "practice", path: "/practice", ready: ".ticket",
    async check(page) {
      const b = await style(page, ".practice-banner", ["background-color", "font-size", "font-weight", "font-family"]);
      eq(b?.["background-color"], T.color.practice, "practice banner yellow");
      eq(b?.["font-size"], T.type.banner.size, "banner size");
      eq(b?.["font-weight"], T.type.banner.weight, "banner weight");
      ok(!b?.["font-family"].toLowerCase().includes("doto"), "banner in one body face, not Doto", b?.["font-family"]);
      const text = await page.textContent(".practice-banner");
      eq(text?.trim(), "Practice money. Not real. No order is ever sent.", "banner text");
      const go = await style(page, ".ticket .t-go", ["border-radius", "background-color"]);
      ok(go?.h >= T.size.cta_min, `primary action ≥${T.size.cta_min}px`, go?.h);
      eq(go?.["border-radius"], T.radius.pill, "primary action is a pill");
      eq(go?.["background-color"], T.color.accent, "primary action in accent");
      const primaries = await page.evaluate(() => [...document.querySelectorAll(".ticket .btn:not(.light)")].length);
      eq(primaries, 1, "one primary action in the ticket");
      const kick = await page.textContent(".pf-head .kicker");
      eq(kick?.trim(), "Pretend total", "total label");
    },
  },
];

const browser = await chromium.launch();
for (const w of T.widths) {
  // A fresh browser each width: a first visit seeds practice from the board (that's how the copied tag appears).
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "no-preference" });
  // The demo portfolio: two stocks and two funds, so the board has fund rows and looked-through stocks.
  await ctx.addInitScript((h) => { if (!localStorage.getItem("stone.holdings")) localStorage.setItem("stone.holdings", h); }, JSON.stringify(DEMO));
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.waitForSelector(".hrow", { timeout: 30000 });
  for (const p of PAGES) {
    console.log(`${p.name} @ ${w}`);
    await page.goto(BASE + p.path);
    try {
      await page.waitForSelector(p.ready, { timeout: 30000 });
    } catch {
      ok(false, `${p.name} rendered (${p.ready})`);
      continue;
    }
    await page.waitForTimeout(400);
    await common(page, w);
    await p.check(page, w);
    if (p.name === "practice") {
      const tags = await page.evaluate(() => document.querySelectorAll(".copied").length);
      ok(tags > 0, "seeded rows say 'copied from your portfolio'", tags);
    }
  }
  // Pro: dark palette on the company page.
  await page.evaluate(() => localStorage.setItem("stone.mode", "pro"));
  await page.goto(BASE + "/company/BX");
  await page.waitForSelector(".sc-svg");
  console.log(`company (Pro) @ ${w}`);
  const pro = await style(page, "body", ["background-color", "color"]);
  eq(pro?.["background-color"], T.color.pro_bg, "Pro background");
  eq(pro?.color, T.color.pro_text, "Pro ink");
  const psw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(psw <= w, `Pro: no horizontal scroll at ${w}`, psw);
  await ctx.close();
}
// Reduced motion: the Lab shows its final state at once.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/lab?t=BX&s=rate_jump");
  await page.waitForSelector(".verdict");
  await page.waitForTimeout(200);
  console.log("lab (reduced motion)");
  const a = await style(page, ".hitdots i.h", ["animation-name"]);
  eq(a?.["animation-name"], "none", "no dot animation under reduced motion");
  const hit = await page.textContent(".lab-result .versus .bignum");
  eq(hit?.trim(), await page.getAttribute(".lab-result .versus .bignum", "aria-label"), "hit rate shown in full at once");
  await ctx.close();
}
await browser.close();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
