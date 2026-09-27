// The expert panel, run in the browser on the board the app already has. Each expert is a pure
// function from the board to candidate lines; the gate orders them and holds back what would be
// noise. Deterministic, so the same board always gives the same briefing. The backend runs the same
// idea with more sources (filings, XBRL); when its script is there, it is used instead (source.ts).

import type { ExposureRow, PortfolioOut, PortfolioRisk, SignalResult } from "@/lib/api";
import { horizonWords, money, pct, shortDate, whole } from "@/lib/format";
import { SIGNAL_WORDS } from "@/lib/words";
import { toSpeech } from "./spoken";
import type { ExpertReport, HeldBack, Line, Panel, Script, Tone } from "./types";

export interface Board {
  portfolio: PortfolioOut;
  risk: PortfolioRisk | null;
}

/** A candidate line: what an expert wants to say, before the gate. */
export interface Candidate extends Omit<Line, "id" | "say"> {
  /** Lower comes first. */
  priority: number;
  expert: string;
}

export type Expert = (b: Board, names: Record<string, string>) => Candidate[];

const LIMIT = 10; // spoken lines per briefing; the rest is held back and listed as such

export const namesOf = (p: PortfolioOut): Record<string, string> =>
  Object.fromEntries([...p.rows.map((r) => [r.symbol, r.name] as const), ...p.exposure.map((e) => [e.symbol, e.name] as const)]);

const isFund = (p: PortfolioOut, symbol: string) => p.rows.find((r) => r.symbol === symbol)?.kind === "etf";

const span = (s: SignalResult) => horizonWords(s.horizon).replace("a ", "");
const later = (s: SignalResult) => (s.vs_market ? `did worse than the whole market over the next ${span(s)}` : `was lower ${horizonWords(s.horizon)} later`);

/** "the last 12 times this happened it was lower a month later 6 times, against 26% in a normal month" */
function history(s: SignalResult, subject: string): string {
  const times = `${s.n} time${s.n === 1 ? "" : "s"}`;
  return `the last ${times} that happened to ${subject}, it ${later(s)} ${s.hits} time${s.hits === 1 ? "" : "s"}, against ${whole(s.normal_rate)} in a normal ${span(s)}`;
}

function proHistory(s: SignalResult): string {
  const range = s.low != null && s.high != null ? `90% range ${whole(s.low)}–${whole(s.high)}` : "no range";
  const holdout = s.holdout ? (s.holdout.held_up ? "held up in both halves" : "did not hold up") : "hold-out not checked";
  return `n=${s.n}, ${s.hits} hits (${whole(s.hit_rate)}) vs ${whole(s.normal_rate)} normal (n=${s.normal_n}), ${range}, ${s.label}, ${holdout}.`;
}

const link = (symbol: string, signal?: string) =>
  signal && signal !== "market_rate_jump" ? `/lab?t=${symbol}&s=${signal}` : `/company/${symbol}`;

// ---------------- the experts ----------------

/** What everything is worth, and today's move when every row has one. */
export const openingExpert: Expert = ({ portfolio: p }) => {
  const all = p.rows.length > 0 && p.rows.every((r) => r.change != null);
  const move = all ? p.rows.reduce((a, r) => a + r.value - r.value / (1 + (r.change as number)), 0) : null;
  const rel = move != null && p.total - move ? move / (p.total - move) : null;
  const when = p.price_as_of ? `at the close on ${shortDate(p.price_as_of)}` : "at the latest close";
  const moveWords = move != null && rel != null ? `, ${move < 0 ? "down" : "up"} ${money(Math.abs(move))} (${pct(rel)}) on the day` : "";
  return [{
    priority: 0, expert: "Opening", tone: "note", ticker: null,
    text: `Everything you own is worth ${money(p.total)} ${when}${moveWords}.`,
    pro: `${p.rows.length} holdings, ${money(p.total)} ${when}${moveWords}. Values from the last close in Precedence's price data.`,
    cites: p.price_as_of ? [`price:${p.price_as_of}`] : [], title: "Everything you own", link: "/",
  }];
};

/** Every Heads up, biggest first: a proven signal is firing for this holding. */
export const watchExpert: Expert = ({ portfolio: p }) => {
  const rows = p.exposure.filter((e) => e.state === "WATCH").sort((a, b) => b.total - a.total);
  return rows.flatMap((e, i) => {
    const s = e.firing.find((f) => f.label === "STRONG") ?? e.firing[0];
    if (!s) return [];
    const fund = isFund(p, e.symbol);
    const subject = fund ? "the whole market" : e.symbol;
    const why = s.signal === "market_rate_jump"
      ? `interest rates jumped, and after the last ${s.n} jumps the whole market fell ${s.hits} time${s.hits === 1 ? "" : "s"}, against ${whole(s.normal_rate)} in a normal ${span(s)}`
      : `${s.lite.toLowerCase()}, and ${history(s, subject)}`;
    const note = s.firing?.note ? ` (${s.firing.note})` : "";
    return [{
      priority: 10 + i, expert: "Heads up", tone: "watch" as Tone, ticker: e.symbol,
      text: `${e.symbol} is Heads up: ${why}.`,
      pro: `${e.symbol} WATCH: ${SIGNAL_WORDS[s.signal] ?? s.signal} firing${note}. ${proHistory(s)}`,
      cites: [s.signal === "market_rate_jump" ? "market:rate_jump" : `signal:${s.signal}`, ...(s.firing ? [`price:${s.firing.known_at.slice(0, 10)}`] : [])],
      title: `${e.name} · Heads up`, link: link(e.symbol, s.signal),
    }];
  });
};

/** Signals firing that have not proven themselves on that stock, grouped by signal. */
export const firingExpert: Expert = ({ portfolio: p }) => {
  const groups = new Map<string, { rows: ExposureRow[]; s: SignalResult }>();
  for (const e of p.exposure) {
    if (e.state === "WATCH") continue;
    for (const s of e.firing) {
      if (s.label === "STRONG") continue;
      const g = groups.get(s.signal) ?? { rows: [], s };
      g.rows.push(e);
      groups.set(s.signal, g);
    }
  }
  return [...groups.entries()].map(([signal, g], i) => {
    const syms = g.rows.map((r) => r.symbol);
    const list = syms.length > 1 ? `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}` : syms[0];
    const one = syms.length === 1 ? g.rows[0] : null;
    const oneS = one?.firing.find((f) => f.signal === signal) ?? g.s;
    const text = one
      ? `${one.symbol}: ${oneS.lite.toLowerCase()}, but ${history(oneS, one.symbol)}, so that is not clearly different from normal.`
      : `${g.s.lite} for ${list} too, but for none of them has it clearly mattered before.`;
    return {
      priority: 30 + i, expert: "Firing, not proven", tone: "calm" as Tone, ticker: one?.symbol ?? null,
      text,
      pro: one ? `${one.symbol}: ${SIGNAL_WORDS[signal] ?? signal} firing. ${proHistory(oneS)}`
        : `${SIGNAL_WORDS[signal] ?? signal} firing for ${list}; every one NOT PROVEN or WEAK on its own history.`,
      cites: [`signal:${signal}`],
      title: one ? `${one.name} · Calm` : `${SIGNAL_WORDS[signal] ?? signal} · not proven`,
      link: link(one?.symbol ?? syms[0], signal),
    };
  });
};

/** How bumpy the mix has been, from the risk card (QuantStats). */
export const riskExpert: Expert = ({ portfolio: p, risk: r }) => {
  if (!r) return [];
  const f = r.portfolio;
  const dollars = f.max_drawdown_dollars != null ? `, about ${money(Math.abs(f.max_drawdown_dollars))} at today's total` : "";
  const out: Candidate[] = [{
    priority: 40, expert: "Risk", tone: "note", ticker: null,
    text: `Your worst drop from a high in the last two years was ${pct(f.max_drawdown, false)}${dollars}, from ${shortDate(f.drawdown_start)} to ${shortDate(f.drawdown_bottom)}.`,
    pro: `Max drawdown ${pct(f.max_drawdown)} (${r.market_symbol}: ${pct(r.market.max_drawdown)}), ${shortDate(f.drawdown_start)} to ${shortDate(f.drawdown_bottom)}; volatility ${pct(f.volatility, false)} vs ${pct(r.market.volatility, false)}; Sharpe ${f.sharpe.toFixed(2)}. ${r.days} days, ${r.basis}.`,
    cites: ["risk:max_drawdown"], title: "How bumpy it's been", link: "/#risk",
  }];
  if (f.beta != null && Number.isFinite(f.beta)) {
    const how = f.beta >= 1.1 ? "more than" : f.beta <= 0.9 ? "less than" : "about as much as";
    out.push({
      priority: 41, expert: "Risk", tone: "note", ticker: null,
      text: `This mix moves ${how} the market: about ${f.beta.toFixed(1)} times the S&P 500's daily moves.`,
      pro: `Beta vs ${r.market_symbol} ${f.beta.toFixed(2)}×; worst day ${pct(f.worst_day)} on ${shortDate(f.worst_day_on)}${f.worst_day_dollars != null ? ` (${money(f.worst_day_dollars)} at today's total)` : ""}.`,
      cites: ["risk:beta"], title: "Next to the market", link: "/#risk",
    });
  }
  if (p.total <= 0) return [];
  return out;
};

/** What the funds are hiding: the biggest company once funds are opened up. */
export const lookThroughExpert: Expert = ({ portfolio: p }) => {
  const funds = p.funds.filter((f) => f.looked_through > 0);
  if (!funds.length) return [];
  const stocks = p.exposure.filter((e) => !isFund(p, e.symbol) && e.share_of_total != null);
  const top = [...stocks].sort((a, b) => (b.share_of_total ?? 0) - (a.share_of_total ?? 0))[0];
  if (!top || top.share_of_total == null) return [];
  const twice = Object.keys(top.via_etf).length > 0;
  const fundList = funds.map((f) => f.symbol).join(" and ");
  return [{
    priority: 50, expert: "Look-through", tone: "note", ticker: top.symbol,
    text: `Once ${fundList} is opened up, ${top.symbol} is your biggest company at ${whole(top.share_of_total)} of everything${twice ? ", because you own it directly and inside the fund" : ""}.`,
    pro: `${top.symbol} ${whole(top.share_of_total)} of total: ${money(top.direct)} direct${Object.entries(top.via_etf).map(([f, v]) => ` + ${money(v)} via ${f}`).join("")}. ${funds.map((f) => `${f.symbol} ${whole(f.looked_through)} looked through (${f.source ?? "holdings"}, ${f.as_of ? shortDate(f.as_of) : "no date"})`).join("; ")}.`,
    cites: [`fund:${funds[0].symbol}`], title: "What you really own", link: "/#ownmap",
  }];
};

/** The biggest one-day hit any single holding has taken. */
export const badDayExpert: Expert = ({ portfolio: p }) => {
  const worst = [...p.exposure].filter((e) => e.bad_day_loss != null && e.bad_day_return != null)
    .sort((a, b) => (a.bad_day_loss ?? 0) - (b.bad_day_loss ?? 0))[0];
  if (!worst || worst.bad_day_loss == null || worst.bad_day_return == null) return [];
  return [{
    priority: 60, expert: "Bad day", tone: "calm", ticker: worst.symbol,
    text: `The sharpest single day among your holdings was ${worst.symbol}: on its worst day in two years, your ${money(worst.total)} in it would have lost ${money(Math.abs(worst.bad_day_loss))}.`,
    pro: `${worst.symbol} worst day ${pct(worst.bad_day_return)} on ${money(worst.total)} = ${money(worst.bad_day_loss)}.`,
    cites: ["risk:worst_day"], title: `${worst.name} · worst day`, link: `/company/${worst.symbol}`,
  }];
};

/** What to do with all that: nothing, or look at the Heads up items. Never advice. */
export const closingExpert: Expert = ({ portfolio: p }) => {
  const watch = p.exposure.filter((e) => e.state === "WATCH").map((e) => e.symbol);
  const what = watch.length
    ? `Two things worth a look today: ${watch.length === 1 ? watch[0] : `${watch.slice(0, -1).join(", ")} and ${watch[watch.length - 1]}`}. Tap either to see the working.`.replace("Two things", watch.length === 1 ? "One thing" : watch.length === 2 ? "Two things" : `${watch.length} things`)
    : "Nothing needs you today.";
  return [{
    priority: 90, expert: "Closing", tone: watch.length ? "watch" : "calm", ticker: null,
    text: `${what} That's the briefing. Nothing here is advice, and Precedence never places an order.`,
    cites: [], title: "That's it", link: "/",
  }];
};

export const EXPERTS: Expert[] = [openingExpert, watchExpert, firingExpert, riskExpert, lookThroughExpert, badDayExpert, closingExpert];

// ---------------- the gate ----------------

/** Orders the candidates and holds back what would be noise: repeats of a holding already covered by
    a Heads up line, and anything past the limit. Every held-back line is listed with its reason. */
export function gate(candidates: Candidate[], limit = LIMIT): { lines: Candidate[]; held: HeldBack[] } {
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
  const held: HeldBack[] = [];
  const spokenFor = new Set<string>();
  const kept: Candidate[] = [];
  for (const c of sorted) {
    if (!c.text.trim()) { held.push({ text: c.text, reason: "empty" }); continue; }
    if (c.ticker && c.tone !== "watch" && c.expert !== "Look-through" && spokenFor.has(c.ticker)) {
      held.push({ text: c.text, reason: `${c.ticker} already covered by a Heads up line` });
      continue;
    }
    if (kept.length >= limit) { held.push({ text: c.text, reason: `past the ${limit}-line limit` }); continue; }
    kept.push(c);
    if (c.ticker && c.tone === "watch") spokenFor.add(c.ticker);
  }
  // The closing line is always last, even when the limit cut before it.
  const closing = sorted.find((c) => c.expert === "Closing");
  if (closing && !kept.includes(closing)) {
    const idx = held.findIndex((h) => h.text === closing.text);
    if (idx >= 0) held.splice(idx, 1);
    if (kept.length >= limit) held.push({ text: kept[kept.length - 1].text, reason: `past the ${limit}-line limit` });
    kept.splice(Math.min(kept.length, limit - 1), kept.length >= limit ? 1 : 0, closing);
  }
  return { lines: kept, held };
}

/** The whole panel: experts, gate, speech. Pure. */
export function composeScript(board: Board, experts: Expert[] = EXPERTS): Script {
  const names = namesOf(board.portfolio);
  const reports: ExpertReport[] = [];
  const candidates: Candidate[] = [];
  for (const expert of experts) {
    const out = expert(board, names);
    candidates.push(...out);
    reports.push({ name: out[0]?.expert ?? expert.name.replace(/Expert$/, ""), considered: out.length, spoken: 0 });
  }
  const { lines, held } = gate(candidates);
  for (const r of reports) r.spoken = lines.filter((l) => l.expert === r.name).length;
  const panel: Panel = { experts: reports.filter((r) => r.considered > 0 || r.name), held_back: held };
  return {
    as_of: board.portfolio.price_as_of,
    generated_by: "experts (browser)",
    panel,
    lines: lines.map((c, i) => ({
      id: `l${i + 1}`, text: c.text, say: toSpeech(c.text, names), pro: c.pro, tone: c.tone,
      cites: c.cites, ticker: c.ticker, title: c.title, link: c.link,
    })),
  };
}
