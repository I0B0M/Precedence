// Robinhood has no public way to connect an account, so /import reads its account activity report instead (the
// CSV Robinhood makes from an account's statements). It lists trades, not holdings: shares are counted from the
// buys, sells and splits, per ticker. Anything else that moves shares is listed for the person to check, never
// guessed. The file is read in the browser; only the tickers and share counts go on to be priced and checked.

export interface RobinhoodHolding {
  symbol: string;
  shares: number;
}

export interface RobinhoodRead {
  holdings: RobinhoodHolding[];
  /** What wasn't counted, one line per ticker, for the person to check before saving. */
  check: { symbol: string; why: string }[];
  /** The first and last activity dates in the file (YYYY-MM-DD). */
  from: string | null;
  to: string | null;
}

export class NotRobinhoodCsv extends Error {
  constructor() {
    super("This isn't Robinhood's account activity report (a CSV with Activity Date, Instrument, Trans Code and Quantity).");
  }
}

const NEEDED = ["Activity Date", "Instrument", "Trans Code", "Quantity"] as const;
const COUNTED: Record<string, 1 | -1> = { BUY: 1, SELL: -1, SPL: 1 }; // a split's line carries the shares it adds
const OPTIONS = new Set(["BTO", "STO", "BTC", "STC", "OEXP", "OASGN", "OEXCS"]);

/** RFC 4180 rows: quoted fields may hold commas, line breaks and doubled quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "BRK-B", "BRK/B" and "BRK B" -> "BRK.B", as the rest of the app writes share classes. */
const cleanSymbol = (raw: string) => raw.trim().toUpperCase().replace(/^([A-Z]+)[-/ ]([A-Z])$/, "$1.$2");

/** "1,050" -> 1050, "(3)" -> -3, "" -> null. */
function quantity(raw: string): number | null {
  const s = raw.trim().replace(/[$,]/g, "");
  if (!s) return null;
  const n = /^\(.*\)$/.test(s) ? -Number(s.slice(1, -1)) : Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "9/24/2026" -> "2026-09-24". */
function isoDate(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

export function readRobinhoodCsv(text: string): RobinhoodRead {
  const rows = csvRows(text);
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase()); // trim() also drops a leading byte order mark
  const col = Object.fromEntries(NEEDED.map((n) => [n, head.indexOf(n.toLowerCase())])) as Record<(typeof NEEDED)[number], number>;
  if (NEEDED.some((n) => col[n] < 0)) throw new NotRobinhoodCsv();

  const net = new Map<string, number>();
  const uncounted = new Map<string, Map<string, number>>(); // symbol -> code -> lines
  const options = new Set<string>();
  const unreadable = new Set<string>();
  const dates: string[] = [];
  for (const r of rows.slice(1)) {
    const day = isoDate(r[col["Activity Date"]] ?? "");
    if (!day) continue; // blank lines and the note at the end
    dates.push(day);
    const symbol = cleanSymbol(r[col.Instrument] ?? "");
    const code = (r[col["Trans Code"]] ?? "").trim().toUpperCase();
    const q = quantity(r[col.Quantity] ?? "");
    if (!symbol || q === null || q === 0) continue; // money in or out (deposits, dividends, interest), no shares
    if (OPTIONS.has(code)) { options.add(symbol); continue; }
    if (Number.isNaN(q)) { unreadable.add(symbol); continue; }
    if (code in COUNTED) { net.set(symbol, (net.get(symbol) ?? 0) + COUNTED[code] * q); continue; }
    const byCode = uncounted.get(symbol) ?? new Map<string, number>();
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
    uncounted.set(symbol, byCode);
  }

  const check: RobinhoodRead["check"] = [];
  const holdings: RobinhoodHolding[] = [];
  for (const [symbol, n] of net) {
    const shares = Math.round(n * 1e6) / 1e6;
    if (shares > 0) holdings.push({ symbol, shares });
    else if (shares < 0) check.push({ symbol, why: "More sold than bought in this file. It may not start when the account opened." });
  }
  for (const symbol of options) check.push({ symbol, why: "Options aren't counted." });
  for (const symbol of unreadable) check.push({ symbol, why: "A share count in the file couldn't be read." });
  for (const [symbol, byCode] of uncounted) {
    for (const [code, lines] of byCode) {
      check.push({ symbol, why: `${lines} ${code} line${lines === 1 ? " isn't" : "s aren't"} counted. Check its shares.` });
    }
  }
  const bySymbol = (a: { symbol: string }, b: { symbol: string }) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
  dates.sort();
  return { holdings: holdings.sort(bySymbol), check: check.sort(bySymbol), from: dates[0] ?? null, to: dates.at(-1) ?? null };
}
