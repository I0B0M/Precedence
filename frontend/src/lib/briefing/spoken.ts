// Turning caption text into something a voice says well: tickers become names, symbols become words.

/** Names for the tickers a line may mention; SPY is "the S&P 500 fund" in speech. */
export function spokenName(symbol: string, names: Record<string, string>): string {
  if (symbol === "SPY") return "the S&P 500 fund";
  const name = names[symbol];
  if (!name) return symbol.split("").join(" ");
  return name.replace(/\s+(ETF|Inc\.?|Corp\.?|Corporation|Co\.?)$/i, "");
}

const MONEY = /\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
const PCT = /(\d+(?:\.\d+)?)%/g;

/** "$16,627" -> "16,627 dollars", "38%" -> "38 percent", "0.24 pt" -> "0.24 points", "AMZN" -> "Amazon". */
export function toSpeech(text: string, names: Record<string, string>): string {
  let s = text.replace(MONEY, "$1 dollars").replace(PCT, "$1 percent").replace(/\bpt\b/g, "points");
  const tickers = Object.keys(names).sort((a, b) => b.length - a.length);
  for (const t of tickers) {
    s = s.replace(new RegExp(`\\b${t.replace(/[.^$*+?()[\]{}|\\]/g, "\\$&")}\\b`, "g"), spokenName(t, names));
  }
  // After the names, so "the S&P 500 fund" is read as words too.
  return s.replace(/\bS&P\b/g, "S and P").replace(/\bthe the\b/g, "the");
}

/** How many words of `text` a voice has reached, given how far it is through `say`. */
export function wordsReached(text: string, fraction: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!Number.isFinite(fraction)) return 0;
  return Math.max(0, Math.min(words, Math.floor(fraction * words + 1e-9)));
}

/** A reading-speed estimate for the timed fallback (no voice available): about 165 words a minute. */
export function estimateMs(say: string): number {
  const words = say.split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.round((words / 165) * 60000) + 400);
}
