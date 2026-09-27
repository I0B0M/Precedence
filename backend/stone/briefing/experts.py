"""The experts: each reads one kind of evidence, in the API's own JSON shapes, and proposes Points.

Pure functions, no I/O. An expert never decides what gets said; it only proposes, with a
salience. The panel's gate picks. Every number an expert prints goes into its line's evidence,
so lines.check() can prove the sentence says what the data says.

Salience, highest first: a proven signal firing now (90), the market's own proven signal (85, 70
when the market fund isn't held), something that fired but hasn't mattered before (40-55), how
bumpy the mix is (40), what the funds hold (35), the latest figures (30), new filings (25),
insider sales (20).
"""

import re
from dataclasses import replace
from datetime import date, timedelta

from stone.briefing.lines import MAX_WORDS, MONTHS, Line, Point, day_words, money, pct, with_pro

STRONG, WEAK, NOT_PROVEN = "STRONG", "WEAK", "NOT PROVEN"
MARKET_FUND = "SPY"
FILINGS_DAYS = 7  # a filing is "new" for a week after it's accepted
_RATE_NOTE = re.compile(r"(\d{4}-\d{2}-\d{2}): 10-year yield (\d+\.\d+)%, up (\d+\.\d+) pt")
_CLUSTER_NOTE = re.compile(r": (\d+) insider sale filings in (\d+) days")
_GAP_NOTE = re.compile(r"(\d{4}-\d{2}-\d{2}): opened (\d+\.\d+)% below the prior close")
FORM_WORDS = {"8-K": "a company news update", "10-Q": "its quarterly report", "10-K": "its annual report",
              "S-1": "a registration for new shares"}


def name_of(co: dict) -> str:
    return "the S&P 500 fund" if co.get("ticker") == MARKET_FUND else co.get("name") or co["ticker"]


def cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def and_list(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


# ---------- signal sentences ----------

def rate_jump(note: str | None) -> tuple[str, float, float] | None:
    """(observation day, yield, rise) from the engine's firing note, e.g.
    "2026-09-24: 10-year yield 5.18%, up 0.24 pt in a week"."""
    m = _RATE_NOTE.match(note or "")
    return (m.group(1), float(m.group(2)), float(m.group(3))) if m else None


def event_line(signal: dict, co: dict, tone: str) -> Line:
    """What happened, in Lite words: "Amazon executives filed 3 or more share sales within 10 days"."""
    key, name, ticker = signal["signal"], name_of(co), co["ticker"]
    firing = signal.get("firing") or {}
    when = f", most recently on {day_words(firing['known_at'])}" if firing.get("known_at") else ""
    cites = [f"signal:{key}"]
    evidence: tuple[float, ...] = ()
    pro: tuple = ()
    if key == "insider_cluster":
        what, evidence = f"{name} executives filed 3 or more share sales within 10 days{when}", (3, 10)
        if (m := _CLUSTER_NOTE.search(firing.get("note") or "")) and firing.get("known_at"):
            count, days = int(m.group(1)), int(m.group(2))
            pro = (f"Form 4: {count} filings with an open-market sale (code S) in {days} days, the latest accepted "
                   f"{day_words(firing['known_at'])}; the signal needs 3 in 10 days.", count, days)
    elif key == "gap_down":
        what, evidence = f"{name} opened 5% or more below the prior close{when}", (0.05,)
        if m := _GAP_NOTE.match(firing.get("note") or ""):
            drop = float(m.group(2))
            pro = (f"Opened {drop:.1f}% below the prior close on {day_words(m.group(1))}; the signal needs 5%.", drop)
    elif (rj := rate_jump(firing.get("note"))) is not None:
        day, level, rise = rj
        what, evidence = f"rates jumped: the 10-year Treasury yield reached {level:.2f}%, up {rise:.2f} points in a week", (level, rise)
        cites.append(f"rate:{day}")
        pro = (f"FRED DGS10 {level:.2f}% on {day_words(day)}, up {rise:.2f} pt on a week earlier; the signal needs "
               f"0.15 pt, counted as known the next weekday afternoon.", 0.15)
    else:
        what = "rates jumped: the 10-year Treasury yield rose 0.15 points or more in a week"
        evidence = (0.15,)
    line = Line(f"{ticker}:{key}:event", tone, f"{cap(what)}.", evidence, tuple(cites), ticker,
                link=signal_link(ticker, key))
    return with_pro(line, *pro) if pro else line


def signal_link(ticker: str, key: str) -> str:
    # The market's own test has no Lab page; the company page for the fund shows it.
    return f"/company/{ticker}" if key == "market_rate_jump" else f"/lab?t={ticker}&s={key}"


def record_line(signal: dict, co: dict, tone: str) -> Line | None:
    """How it went before: "Amazon was lower 20 trading days later 6 of the last 12 times, against 26% of normal days"."""
    n, hits, h, normal = signal.get("n"), signal.get("hits"), signal.get("horizon"), signal.get("normal_rate")
    if not n or hits is None or normal is None:
        return None
    name, key, ticker = cap(name_of(co)), signal["signal"], co["ticker"]
    moved = (f"did worse than the market over the next {h} trading days" if signal.get("vs_market")
             else f"was lower {h} trading days later")
    text = f"{name} {moved} {hits} of the last {n} times, against {pct(normal)} of normal days."
    line = Line(f"{ticker}:{key}:record", tone, text, (h, hits, n, normal), (f"signal:{key}",), ticker,
                link=signal_link(ticker, key))
    rate, low, high, nh, nn = (signal.get(k) for k in ("hit_rate", "low", "high", "normal_hits", "normal_n"))
    if None in (rate, low, high, nh, nn):
        return line
    pro_moved = f"worse than SPY over {h} days" if signal.get("vs_market") else f"lower after {h} days"
    return with_pro(line, f"{hits}/{n} {pro_moved} ({pct(rate)}, 90% Wilson range {pct(low)} to {pct(high)}) vs "
                          f"{nh}/{nn} normal days ({pct(normal)}); label {signal['label']}.", rate, 0.9, low, high, nh, nn)


# The same test and words the landing ("0 survive") and Pro ("Doesn't survive the correction") use: the Benjamini-
# Hochberg correction across every stock-signal pair in the latest scan (SignalResult.fdr10_survives)
CORRECTION_WORDS = {True: "It survives the correction for testing many stocks at once",
                    False: "It doesn't survive the correction for testing many stocks at once"}
OUTSIDE_CORRECTION = "It's the market's own test, outside the correction across stocks"
HOLDOUT_WORDS = {
    "held up": "it held up in both halves of the history",
    "did not hold": "it did not hold up in both halves of the history",
    "too few cases to check": "there are too few cases yet to check it on each half of the history",
}


def confidence_line(signal: dict, ticker: str) -> Line | None:
    """How sure we are, in one sentence: the correction for testing many stocks at once (fdr10_survives, the
    same result the landing and Pro show) and the backend's hold-out verdict. No correction result (fewer
    than 10 cases, or saved data exported before it existed) says nothing about it, never "passes"; the
    market's own test is said to be outside it. The stricter test's numbers stay in the Pro detail.
    A saved hold-out without a verdict says nothing, never "held up"."""
    st, verdict = signal.get("strict"), (signal.get("holdout") or {}).get("verdict")
    fdr = signal.get("fdr10_survives")
    if fdr is not None:
        corr, good = CORRECTION_WORDS[fdr], fdr
    elif signal.get("signal") == "market_rate_jump":
        corr, good = OUTSIDE_CORRECTION, None
    else:
        corr = good = None
    held = HOLDOUT_WORDS.get(verdict)
    if corr and held:
        mixed = good is not None and verdict in ("held up", "did not hold") and good != (verdict == "held up")
        text = f"{corr}{', but ' if mixed else ', and '}{held}."
    elif corr or held:
        text = f"{cap(corr or held)}."
    else:
        return None
    key = signal["signal"]
    line = Line(f"{ticker}:{key}:confidence", "note", text, (), (f"signal:{key}",), ticker,
                link=signal_link(ticker, key))
    parts, evidence = [], []
    if st and all(st.get(k) is not None for k in ("normal_periods", "diff_low", "diff_high", "p")):
        parts.append(f"Newcombe range for the difference over {st['normal_periods']:.1f} separate normal periods: "
                     f"{st['diff_low'] * 100:+.0f} to {st['diff_high'] * 100:+.0f} points, one-sided p {st['p']:.2f}")
        evidence += [st["normal_periods"], st["diff_low"], st["diff_high"], st["p"]]
    halves = signal.get("holdout") or {}
    if held and halves.get("first") and halves.get("second"):
        a, b = halves["first"], halves["second"]
        parts.append(f"hold-out halves {a['hits']}/{a['n']} and {b['hits']}/{b['n']}, each needing 10 cases")
        evidence += [a["hits"], a["n"], b["hits"], b["n"], 10]
    return with_pro(line, cap("; ".join(parts)) + ".", *evidence) if parts else line


def proven_point(signal: dict, co: dict, salience: int, title: str) -> Point:
    """A STRONG signal firing now: what happened, how it went before, and how sure we are."""
    ticker = co["ticker"]
    head = replace(event_line(signal, co, "watch"), title=title)
    lines = [head, record_line(signal, co, "watch"), confidence_line(signal, ticker)]
    return Point(f"{ticker}:{signal['signal']}", "signals", salience, tuple(line for line in lines if line))


def unproven_point(signal: dict, co: dict) -> Point:
    """Fired, but it hasn't clearly mattered here before (NOT PROVEN), or too rare to test (WEAK)."""
    ticker, key, name = co["ticker"], signal["signal"], name_of(co)
    head = event_line(signal, co, "calm")
    if signal["label"] == WEAK:
        text = f"It has happened only {signal['n']} times for {name}, too few to test."
        tail = Line(f"{ticker}:{key}:rare", "calm", text, (signal["n"],), (f"signal:{key}",), ticker,
                    link=signal_link(ticker, key))
        return Point(f"{ticker}:{key}", "signals", 40, (head, tail))
    record = record_line(signal, co, "calm")
    if record is None:
        return Point(f"{ticker}:{key}", "signals", 50, (head,))
    merged = replace(record, text=f"{record.text[:-1]}, so it hasn't clearly mattered.")
    if len(merged.text.split()) <= MAX_WORDS:
        return Point(f"{ticker}:{key}", "signals", 50, (head, merged))
    verdict = Line(f"{ticker}:{key}:verdict", "calm", f"So for {name}, that hasn't clearly mattered before.", (),
                   (f"signal:{key}",), ticker, link=signal_link(ticker, key))
    return Point(f"{ticker}:{key}", "signals", 50, (head, record, verdict))


def firing(co: dict) -> list[dict]:
    return [s for s in co.get("signals") or [] if s.get("firing") and s.get("label") in (STRONG, WEAK, NOT_PROVEN)]


# ---------- experts for one company ----------

def signals_expert(co: dict) -> list[Point]:
    """A stock's own signals that are firing now."""
    c = co["company"]
    if c.get("kind") != "stock":
        return []
    return [proven_point(s, c, 90, f"{name_of(c)} · Heads up") if s["label"] == STRONG else unproven_point(s, c)
            for s in firing(co)]


def market_expert(market: dict | None, held: bool) -> list[Point]:
    """The rate-jump test run on the market itself (SPY): was the whole market lower afterwards?"""
    if not market or not market.get("firing") or market.get("label") not in (STRONG, NOT_PROVEN):
        return []
    co = {"ticker": market.get("symbol") or MARKET_FUND, "name": "the market"}
    if market["label"] == STRONG:
        salience, tone, title = (85 if held else 70), "watch", "The market · Heads up"
    else:
        salience, tone, title = 45, "calm", "The market"
    head = event_line(market, co, tone)
    head = replace(head, id=f"market:{head.id}", cites=(*head.cites, "market:rate_jump"), title=title)
    record = record_line(market, co, tone)
    lines = [head, record and replace(record, id=f"market:{record.id}", cites=("market:rate_jump",))]
    if market["label"] == STRONG:
        lines.append(confidence_line(market, co["ticker"]))
    else:
        lines.append(Line("market:verdict", "calm", "For the market as a whole, that hasn't clearly mattered before.",
                          (), ("market:rate_jump",), co["ticker"], link=signal_link(co["ticker"], market["signal"])))
    return [Point("market:rate_jump", "market", salience, tuple(line for line in lines if line))]


def not_firing_expert(co: dict) -> list[Point]:
    """A signal that has mattered here before but isn't happening now: worth knowing, not a heads-up."""
    c = co["company"]
    out = []
    for s in co.get("signals") or []:
        if s.get("label") != STRONG or s.get("firing") or c.get("kind") != "stock":
            continue
        record = record_line(s, c, "note")
        if record:
            lite = s["lite"][:1].lower() + s["lite"][1:]
            head = Line(f"{c['ticker']}:{s['signal']}:quiet", "note",
                        f"When {lite}, it has mattered for {name_of(c)} before, but that isn't happening now.",
                        (0.05,) if s["signal"] == "gap_down" else (), (f"signal:{s['signal']}",), c["ticker"],
                        link=signal_link(c["ticker"], s["signal"]))
            out.append(Point(f"{c['ticker']}:{s['signal']}", "signals", 30, (head, record)))
    return out


def facts_expert(co: dict) -> list[Point]:
    """The latest quarter's money in and profit, from the company's own XBRL."""
    c, facts = co["company"], {f["key"]: f for f in co.get("facts") or []}
    rev, ni = facts.get("revenue"), facts.get("net_income")
    if not rev and not ni:
        return []
    end = (rev or ni)["period_end"]
    parts, evidence, cites = [], [], []
    if rev:
        parts.append(f"money coming in was {money(rev['value'])}")
        evidence.append(rev["value"])
        cites.append("fact:revenue")
    if ni:
        parts.append(f"profit was {money(ni['value'])}" if ni["value"] >= 0 else f"it lost {money(ni['value'])}")
        evidence.append(ni["value"])
        cites.append("fact:net_income")
    text = f"In the quarter to {day_words(end)}, {' and '.join(parts)}."
    line = Line(f"{c['ticker']}:facts", "note", text, tuple(evidence), tuple(cites), c["ticker"],
                "Latest figures", f"/company/{c['ticker']}")
    shown = [f for f in (rev, ni) if f]
    concepts = " and ".join(f"{f['concept']} {money(f['value'])}" for f in shown)
    pro = f"XBRL {concepts}, from the {shown[0]['form']} for the quarter to {day_words(end)}."
    return [Point(f"{c['ticker']}:facts", "figures", 30, (with_pro(line, pro),))]


def filings_expert(co: dict, as_of: str) -> list[Point]:
    """Filings from the last week. Not tested, so said last and plainly: they're new, not a signal."""
    c = co["company"]
    end = date.fromisoformat(as_of[:10])
    out = []
    for f in co.get("filings") or []:
        form = f.get("form") or ""
        filed = f.get("filed_date") or (f.get("accepted_at") or "")[:10]
        if not filed or form.startswith("4") or not (end - timedelta(days=FILINGS_DAYS) < date.fromisoformat(filed) <= end):
            continue
        base = form.removesuffix("/A")
        what = f"{'an' if base[:1] in 'S8' else 'a'} {form}"
        gloss = FORM_WORDS.get(base)
        text = f"{cap(name_of(c))} filed {what}{f', {gloss},' if gloss else ''} with the SEC on {day_words(filed)}."
        line = Line(f"{c['ticker']}:filing:{f['accession']}", "note", text, (), (f"filing:{f['accession']}",),
                    c["ticker"], "New filing", f"/company/{c['ticker']}")
        out.append(Point(f"{c['ticker']}:filing:{f['accession']}", "filings", 25, (line,)))
    return out


def person(owner_name: str) -> str:
    """SEC prints owners last name first: "Baratta Joseph" -> "Joseph Baratta"."""
    parts = owner_name.split()
    return " ".join(parts[1:] + parts[:1]) if len(parts) > 1 else owner_name


def insider_expert(co: dict) -> list[Point]:
    """The latest open-market insider sale, as filed."""
    c, sales = co["company"], co.get("insider_sales") or []
    s = next((s for s in sales if s.get("shares") and s.get("price") and s.get("owner_name")), None)
    if not s:
        return []
    day = s.get("transaction_date") or s["accepted_at"][:10]
    title = f" ({s['owner_title']})" if s.get("owner_title") else ""
    text = (f"The latest insider sale: {person(s['owner_name'])}{title} sold {s['shares']:,.0f} shares at "
            f"{money(s['price'])} on {day_words(day)}.")
    line = Line(f"{c['ticker']}:insider:{s['accession']}", "note", text, (s["shares"], s["price"]),
                (f"filing:{s['accession']}",), c["ticker"], "Insider sale", f"/company/{c['ticker']}")
    return [Point(f"{c['ticker']}:insider", "insiders", 20, (line,))]


# ---------- experts for a whole portfolio ----------

def unproven_across(companies: list[dict], values: dict[str, float]) -> list[Point]:
    """The market-wide rate jump fires for every stock at once. Said once for all of them, with the
    biggest holding as the example, instead of once per stock."""
    fired = [(co["company"], s) for co in companies if co["company"].get("kind") == "stock"
             for s in firing(co) if s["signal"] == "rate_jump" and s["label"] != STRONG]
    if not fired:
        return []
    stocks = [c for c in companies if c["company"].get("kind") == "stock"]
    names = [name_of(c) for c, _ in fired]
    if len(fired) == 1:
        text = f"The rate jump is firing for {names[0]} too, but there it hasn't clearly mattered beyond the market."
    else:
        who = f"all {len(fired)} of your stocks" if len(fired) == len(stocks) else and_list(names)
        text = f"The rate jump is firing for {who} too, but for none of them has it clearly mattered beyond the market."
    c, s = max(fired, key=lambda cs: values.get(cs[0]["ticker"], 0.0))
    head = Line("stocks:rate_jump:event", "calm", text, (len(fired),), ("signal:rate_jump",), None, "Your stocks",
                signal_link(c["ticker"], "rate_jump"))
    record = record_line(s, c, "calm")
    return [Point("stocks:rate_jump", "signals", 55, tuple(line for line in (head, record) if line))]


def risk_expert(risk: dict | None) -> list[Point]:
    """How bumpy today's mix has been (QuantStats on the saved closes)."""
    mine = (risk or {}).get("portfolio")
    if not mine or mine.get("worst_day") is None:
        return []
    since = date.fromisoformat(risk["start"])
    worst = (f"Since {MONTHS[since.month - 1]} {since.year}, this mix's worst day was "
             f"{day_words(mine['worst_day_on'], risk['end'])}, when it fell {pct(mine['worst_day'], 1)}")
    evidence = [mine["worst_day"]]
    if mine.get("worst_day_dollars") is not None:
        worst += f", about {money(mine['worst_day_dollars'])} at today's value"
        evidence.append(mine["worst_day_dollars"])
    first = Line("risk:worst_day", "note", f"{worst}.", tuple(evidence), ("risk:worst_day", "risk:worst_day_dollars"),
                 None, "Your mix", "/")
    mkt, sym = risk.get("market") or {}, risk.get("market_symbol") or MARKET_FUND
    if all(v is not None for v in (mine.get("volatility"), mkt.get("volatility"), mine.get("sharpe"), mkt.get("sharpe"))):
        first = with_pro(first, f"QuantStats on {risk['days']} daily closes: volatility {pct(mine['volatility'], 1)} vs "
                                f"{pct(mkt['volatility'], 1)} for {sym}, Sharpe {mine['sharpe']:.2f} vs {mkt['sharpe']:.2f} "
                                f"at a 0% risk-free rate.", risk["days"], mine["volatility"], mkt["volatility"],
                         mine["sharpe"], mkt["sharpe"], 0)
    lines = [first]
    if mine.get("beta") is not None and mine.get("max_drawdown") is not None:
        beta = Line("risk:beta", "note",
                    f"It swings about {mine['beta']:.1f} times as much as the market, and its deepest fall "
                    f"was {pct(mine['max_drawdown'], 1)}.", (mine["beta"], mine["max_drawdown"]),
                    ("risk:beta", "risk:max_drawdown"), None, "Your mix", "/")
        if mine.get("drawdown_start") and mine.get("drawdown_bottom") and mkt.get("max_drawdown") is not None:
            beta = with_pro(beta, f"Beta {mine['beta']:.2f} vs {sym}; max drawdown {pct(mine['max_drawdown'], 1)} from "
                                  f"{day_words(mine['drawdown_start'], risk['end'])} to "
                                  f"{day_words(mine['drawdown_bottom'], risk['end'])}, {sym} "
                                  f"{pct(mkt['max_drawdown'], 1)}.", mkt["max_drawdown"])
        lines.append(beta)
    return [Point("risk", "risk", 40, tuple(lines))]


def look_through_expert(board: dict | None, names: dict[str, str]) -> list[Point]:
    """Counting what's inside the funds you hold: your biggest real position."""
    if not board:
        return []
    funds = [f for f in board.get("funds") or [] if f.get("looked_through")]
    fund_symbols = {f["symbol"] for f in board.get("funds") or []}
    stocks = [e for e in board.get("exposure") or [] if e["symbol"] not in fund_symbols and e.get("share_of_total")]
    if not funds or not stocks:
        return []
    top = max(stocks, key=lambda e: e["total"])
    fund_names = and_list([name_of({"ticker": f["symbol"], "name": names.get(f["symbol"])}) for f in funds])
    text = (f"Counting what's inside {fund_names}, your biggest real position is "
            f"{names.get(top['symbol'], top['name'])}, at {pct(top['share_of_total'])} of everything you own.")
    line = Line("portfolio:look_through", "note", text, (top["share_of_total"],), ("portfolio:exposure",),
                top["symbol"], "What you really own", "/")
    via = {f: v for f, v in (top.get("via_etf") or {}).items() if v}
    if via and top.get("direct") is not None and board.get("total"):
        inside = " and ".join(f"{money(v)} through {f}" for f, v in via.items())
        line = with_pro(line, f"{top['symbol']}: {money(top['direct'])} direct plus {inside}, "
                              f"{pct(top['share_of_total'], 1)} of {money(board['total'])}.",
                        top["direct"], *via.values(), board["total"])
    return [Point("portfolio:look_through", "look-through", 35, (line,))]
