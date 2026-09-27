"""The briefing: a panel of experts proposes, a gate picks, every line is checked.

Pure functions, no I/O; the inputs are the API's own JSON (GET /api/companies/{t},
POST /api/portfolio, POST /api/portfolio/risk, GET /api/market/rate_jump), so the live API and the
saved demo data build the same briefing.

It has the shape of a mixture of experts (specialists plus a gate that keeps the top few, with a
cap per expert so no one expert crowds out the rest). But every expert is a tested rule, not a
trained network: 15 to 50 past events per stock can't train one, and a rule can say why it spoke.
No language model writes a word or a number here.
"""

from dataclasses import dataclass

from stone.briefing import experts as ex
from stone.briefing.lines import Line, Point, check, day_words, money, pct, speakable, up_down

GENERATED_BY = "Stone expert panel: tested rules, no language model"
PORTFOLIO_LINES = 16  # about a minute and a half spoken
COMPANY_LINES = 10
PER_EXPERT = 3  # points one expert may have spoken
TESTED = ("STRONG", "WEAK", "NOT PROVEN")


@dataclass(frozen=True)
class HeldBack:
    point: Point
    reason: str


@dataclass(frozen=True)
class Briefing:
    kind: str  # "portfolio" | "company"
    subject: str  # the portfolio's saved key, or the ticker
    as_of: str
    lines: tuple[Line, ...]
    considered: tuple[Point, ...]
    held_back: tuple[HeldBack, ...]


def gate(points: list[Point], budget: int, per_expert: int = PER_EXPERT,
         names: tuple[str, ...] = ()) -> tuple[list[Point], list[HeldBack]]:
    """Highest salience first; a point that fails the check, would pass the line budget, or finds its
    expert already at the cap is held back, with the reason. Ties keep the experts' own order."""
    kept, held, used, per = [], [], 0, {}
    for p in sorted(points, key=lambda p: -p.salience):  # sorted() is stable
        problems = [f"{line.id}: {msg}" for line in p.lines for msg in check(line, names)]
        if problems:
            held.append(HeldBack(p, "failed the check: " + "; ".join(problems)))
        elif per.get(p.expert, 0) >= per_expert:
            held.append(HeldBack(p, f"the {p.expert} expert already has {per_expert} points"))
        elif used + len(p.lines) > budget:
            held.append(HeldBack(p, f"over the {budget}-line limit"))
        else:
            kept.append(p)
            used += len(p.lines)
            per[p.expert] = per.get(p.expert, 0) + 1
    return kept, held


def tests_run(companies: list[dict]) -> tuple[int, int]:
    """(tests run, proven signals firing now) across these companies' signals."""
    signals = [s for co in companies for s in co.get("signals") or [] if s.get("label") in TESTED]
    return len(signals), sum(1 for s in signals if s["label"] == "STRONG" and s.get("firing"))


def assemble(kind: str, subject: str, as_of: str, opening: list[Line], points: list[Point], closing: Line,
             budget: int, names: tuple[str, ...]) -> Briefing:
    """Opening and closing frame the gated points. They're checked too; one that fails is held back."""
    kept, held = gate(points, budget - len(opening) - 1, names=names)
    frame = [Point(line.id, "panel", 100, (line,)) for line in (*opening, closing)]
    bad = [HeldBack(p, "failed the check: " + "; ".join(check(p.lines[0], names)))
           for p in frame if check(p.lines[0], names)]
    ok = {p.key for p in frame} - {h.point.key for h in bad}
    lines = [line for line in opening if line.id in ok]
    lines += [line for p in kept for line in p.lines]
    lines += [closing] if closing.id in ok else []
    return Briefing(kind, subject, as_of, tuple(lines), tuple(points), tuple(bad + held))


# ---------- one company ----------

def company_briefing(detail: dict) -> Briefing:
    """detail: GET /api/companies/{ticker}."""
    co, last = detail["company"], detail.get("last")
    ticker, name = co["ticker"], ex.name_of(co)
    as_of = last["day"] if last else ""
    opening = []
    if last:
        change = last.get("change")
        moved = f", {up_down(change)} {pct(change, 1)} on the day" if change is not None else ""
        opening.append(Line(f"{ticker}:price", "note",
                            f"{ex.cap(name)} closed at {money(last['close'])} on {day_words(last['day'], weekday=True)}{moved}.",
                            (last["close"], *((change,) if change is not None else ())), (f"price:{last['day']}",),
                            ticker, ticker, f"/company/{ticker}"))
    state = detail.get("state")
    if state == "WATCH":
        opening.append(Line(f"{ticker}:state", "watch", f"{ex.cap(name)} needs a look today.",
                            (), tuple(f"signal:{s['signal']}" for s in ex.firing(detail) if s["label"] == "STRONG"),
                            ticker, "Heads up", f"/company/{ticker}"))
    elif state == "CALM":
        opening.append(Line(f"{ticker}:state", "calm",
                            f"{ex.cap(name)} is calm: nothing happening now has mattered here before.", (),
                            tuple(f"signal:{s['signal']}" for s in detail.get("signals") or []) or (f"price:{as_of}",),
                            ticker, "Calm", f"/company/{ticker}"))

    market = next((s for s in detail.get("signals") or [] if s["signal"] == "market_rate_jump"), None)
    points = [*ex.signals_expert(detail),
              *ex.market_expert({**market, "symbol": ticker} if market else None, held=True),
              *ex.not_firing_expert(detail), *ex.facts_expert(detail),
              *(ex.filings_expert(detail, as_of) if as_of else []), *ex.insider_expert(detail)]
    ran, proven = tests_run([detail])
    closing = Line(f"{ticker}:closing", "calm" if not proven else "note",
                   f"Stone ran {ran} test{'' if ran == 1 else 's'} on {name}, and " + (
                       f"{proven} of what is happening now has mattered before." if proven
                       else "nothing happening now has mattered before."),
                   (ran, proven), tuple(f"signal:{s['signal']}" for s in detail.get("signals") or []) or (f"price:{as_of}",),
                   ticker, "That's all", f"/company/{ticker}")
    return assemble("company", ticker, as_of, opening, points, closing, COMPANY_LINES, (name, ex.cap(name)))


# ---------- a whole portfolio ----------

def portfolio_briefing(board: dict, companies: dict[str, dict], market: dict | None, risk: dict | None,
                       subject: str = "") -> Briefing:
    """board: POST /api/portfolio; companies: GET /api/companies/{t} for each holding;
    market: GET /api/market/rate_jump; risk: POST /api/portfolio/risk (None when it couldn't be computed)."""
    as_of = board.get("price_as_of") or ""
    rows = board.get("rows") or []
    held = [companies[r["symbol"]] for r in rows if r["symbol"] in companies]
    names = {t: ex.name_of(co["company"]) for t, co in companies.items()}
    states = {e["symbol"]: e.get("state") for e in board.get("exposure") or []}
    values = {r["symbol"]: r["value"] for r in rows}

    opening = []
    total = board.get("total") or 0.0
    before = sum(r["value"] / (1 + r["change"]) for r in rows if r.get("change") is not None)
    now = sum(r["value"] for r in rows if r.get("change") is not None)
    if rows:
        hello = f"Here is your Stone briefing for {day_words(as_of, weekday=True)}: your" if as_of else "Your"
        moved = f", {up_down(now - before)} {pct(now / before - 1, 1)} on the day" if before else ""
        opening.append(Line("portfolio:total", "note",
                            f"{hello} {len(rows)} {'holding is' if len(rows) == 1 else 'holdings are'} worth "
                            f"{money(total)}{moved}.",
                            (len(rows), total, *((now / before - 1,) if before else ())),
                            (f"price:{as_of}",) if as_of else ("portfolio:total",), None, "Stone briefing", "/"))
        watch = [r["symbol"] for r in rows if states.get(r["symbol"]) == "WATCH"]
        calm = [r["symbol"] for r in rows if states.get(r["symbol"]) == "CALM"]
        if watch:
            who = ex.cap(ex.and_list([names.get(t, t) for t in watch]))
            rest = f"; the other {len(calm)} {'is' if len(calm) == 1 else 'are'} calm" if calm else ""
            opening.append(Line("portfolio:states", "watch", f"{who} {'needs' if len(watch) == 1 else 'need'} a look{rest}.",
                                (len(calm),), ("portfolio:states",),
                                None, "Heads up", "/"))
        elif calm:
            opening.append(Line("portfolio:states", "calm",
                                "It is calm: nothing happening now has mattered for it before." if len(calm) == 1 else
                                f"All {len(calm)} are calm: nothing happening now has mattered for them before.",
                                (len(calm),), ("portfolio:states",), None, "Calm", "/"))

    points: list[Point] = []
    for co in held:
        # the market-wide rate jump is said once for every stock (unproven_across), not once per stock
        points += [p for p in ex.signals_expert(co)
                   if not (p.key.endswith(":rate_jump") and p.salience < 90)]
    points += ex.unproven_across(held, values)
    points += ex.market_expert(market, held=ex.MARKET_FUND in values)
    points += ex.risk_expert(risk)
    points += ex.look_through_expert(board, names)
    for co in held:
        points += ex.filings_expert(co, as_of) if as_of else []

    ran, proven = tests_run(held)
    closing = Line("portfolio:closing", "calm",
                   f"That's everything: Stone ran {ran} test{'' if ran == 1 else 's'} on your holdings, and " + (
                       f"only {proven} of the signals happening now {'has' if proven == 1 else 'have'} mattered before."
                       if proven else "nothing happening now has mattered before."),
                   (ran, proven), ("portfolio:states",), None, "That's all", "/")
    spoken_names = tuple(n for name in names.values() for n in (name, ex.cap(name)))
    return assemble("portfolio", subject, as_of, opening, points, closing, PORTFOLIO_LINES, spoken_names)


# ---------- JSON ----------

def line_json(line: Line) -> dict:
    return {"id": line.id, "text": line.text, "say": speakable(line.text), "tone": line.tone,
            "cites": list(line.cites), "ticker": line.ticker, "title": line.title, "link": line.link}


def briefing_json(b: Briefing) -> dict:
    spoken = {line.id for line in b.lines}
    experts: dict[str, dict] = {}
    for p in b.considered:
        e = experts.setdefault(p.expert, {"name": p.expert, "considered": 0, "spoken": 0})
        e["considered"] += 1
        e["spoken"] += all(line.id in spoken for line in p.lines)
    out = {"kind": b.kind, "as_of": b.as_of, "generated_by": GENERATED_BY,
           "lines": [line_json(line) for line in b.lines],
           "panel": {"experts": list(experts.values()),
                     "held_back": [{"expert": h.point.expert, "text": " ".join(line.text for line in h.point.lines),
                                    "reason": h.reason} for h in b.held_back]}}
    out["ticker" if b.kind == "company" else "key"] = b.subject
    return out
