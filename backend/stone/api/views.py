"""Turns database rows and engine results into the JSON the frontend reads."""

import bisect
from datetime import date, datetime, timedelta

import psycopg

from stone.signals import engine

# What we show from XBRL, in order. Companies tag revenue differently, so the
# first concept that exists wins. `lite` is the plain-words name.
KEY_FACTS = [
    ("revenue", "Revenue", "Money coming in", True,
     ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"]),
    ("net_income", "Net income", "Profit", True, ["NetIncomeLoss"]),
    ("assets", "Total assets", "Everything it owns", False, ["Assets"]),
    ("long_term_debt", "Long-term debt", "Money it owes long term", False,
     ["LongTermDebt", "LongTermDebtNoncurrent"]),
    ("cash", "Cash and equivalents", "Cash on hand", False, ["CashAndCashEquivalentsAtCarryingValue"]),
]


def strict_json(r: engine.Result) -> dict | None:
    """The same counts under the stricter test (the normal rate is uncertain too), for Pro's
    "borderline" note. It never changes the label. None below 10 cases or without normal days."""
    st = engine.strict_evidence(r)
    return None if st is None else {"p": st.p, "diff_low": st.diff_low, "diff_high": st.diff_high,
                                    "normal_periods": st.normal_periods}


def strict_from_saved(signal: dict, price_days: list[str]) -> dict | None:
    """`strict` rebuilt from a saved signal (a fixture exported before the field existed) and the
    stock's price days. Under the label rule the normal days skip the case windows and at most one
    still-open window, whose start isn't saved when a later event is the one shown as firing. So
    every possible start is tried, and a rebuild counts only if it reproduces the saved number of
    normal days. None when nothing matches, below 10 cases, or without the cases."""
    if signal.get("strict") is not None:
        return signal["strict"]
    h, n, cases = signal["horizon"], signal["n"], signal.get("cases")
    if n < engine.MIN_CASES or not signal.get("normal_n") or cases is None:
        return None
    days = sorted(date.fromisoformat(d[:10]) for d in price_days)
    at = {d: i for i, d in enumerate(days)}
    entries = [at.get(date.fromisoformat(c["entry_day"])) for c in cases]
    if None in entries:
        return None
    last = len(days)
    windows = [(i, i + h) for i in entries]
    open_starts: list[int | None] = [None]
    if signal.get("firing"):
        shown = bisect.bisect_right([engine.open_at(d) for d in days], datetime.fromisoformat(signal["firing"]["known_at"]))
        busy_until = max((i + h for i in entries), default=0)
        open_starts += list(range(max(busy_until, last - h + 1, 0), min(shown, last - 1) + 1))
    periods = set()
    for a in open_starts:
        starts = engine.normal_starts(engine.window_days(last, windows + ([(a, last)] if a is not None else [])), h)
        if len(starts) == signal["normal_n"]:
            periods.add(engine.periods_spanned(starts, h))
    if len(periods) != 1:
        return None
    return strict_json(engine.Result(
        signal=signal["signal"], horizon=h, n=n, hits=signal["hits"], hit_rate=signal["hit_rate"],
        normal_n=signal["normal_n"], normal_hits=signal["normal_hits"], normal_rate=signal["normal_rate"],
        low=signal["low"], high=signal["high"], label=signal["label"], firing=None, normal_periods=periods.pop()))


def holdout_from_saved(holdout: dict | None) -> dict | None:
    """A saved hold-out (exported before `verdict` existed) under the current rule: each half needs
    10 cases of its own before it can confirm anything, so held_up can only follow from the verdict."""
    if holdout is None:
        return None
    halves = (holdout["first"], holdout["second"])
    if any(h["n"] < engine.MIN_CASES for h in halves):
        verdict = engine.TOO_FEW_TO_CHECK
    elif all(h["hit_rate"] is not None and h["normal_rate"] is not None and h["hit_rate"] > h["normal_rate"]
             for h in halves):
        verdict = engine.HELD_UP
    else:
        verdict = engine.DID_NOT_HOLD
    return {**holdout, "verdict": verdict, "held_up": verdict == engine.HELD_UP}


def with_strict(signal: dict, price_days: list[str]) -> dict:
    """A saved signal as the live API would send it now (for the offline snapshot): `strict` filled in
    whenever it can be rebuilt exactly, and the hold-out's verdict under the current rule."""
    return {**signal, "strict": strict_from_saved(signal, price_days), "holdout": holdout_from_saved(signal.get("holdout"))}


def result_json(r: engine.Result, with_cases: bool = True) -> dict:
    spec = engine.ALL_SPECS[r.signal]
    out = {
        "signal": r.signal, "lite": spec.lite, "pro": spec.pro, "horizon": r.horizon,
        "vs_market": spec.vs_market,  # true: a hit means "did worse than the market", not "was lower"
        "n": r.n, "hits": r.hits, "hit_rate": r.hit_rate,
        "normal_n": r.normal_n, "normal_hits": r.normal_hits, "normal_rate": r.normal_rate,
        "low": r.low, "high": r.high, "label": r.label,
        "firing": {"known_at": r.firing.known_at.isoformat(), "note": r.firing.note} if r.firing else None,
        "note": r.note,
        "strict": strict_json(r),
    }
    if r.holdout:
        half = lambda h: {"n": h.n, "hits": h.hits, "hit_rate": h.hit_rate, "normal_rate": h.normal_rate,
                          "normal_n": h.normal_n, "label": h.label}
        out["holdout"] = {"first": half(r.holdout.first), "second": half(r.holdout.second),
                          "held_up": r.holdout.held_up,
                          "verdict": r.holdout.verdict}  # "held up" | "did not hold" | "too few cases to check"
    else:
        out["holdout"] = None
    if with_cases:
        out["cases"] = [{"known_at": c.known_at.isoformat(), "entry_day": c.entry_day.isoformat(),
                         "exit_day": c.exit_day.isoformat(), "ret": c.ret, "market_ret": c.market_ret,
                         "hit": c.hit, "note": c.note}
                        for c in r.cases]
    return out


def filing_url(cik: int | None, accession: str, primary_doc: str | None, source: str) -> str | None:
    if source != "sec" or not cik:
        return None
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/{primary_doc or ''}"


def latest_facts(conn: psycopg.Connection, ticker: str) -> list[dict]:
    concepts = [c for *_, cs in KEY_FACTS for c in cs]
    rows = conn.execute(
        """select concept, value, unit, period_start, period_end, form, accession, filed from xbrl_facts
           where ticker = %s and taxonomy = 'us-gaap' and concept = any(%s)
             and form in ('10-K', '10-Q', '10-K/A', '10-Q/A')""", (ticker, concepts)).fetchall()
    out = []
    for key, pro, lite, is_flow, candidates in KEY_FACTS:
        for concept in candidates:
            pick = [r for r in rows if r["concept"] == concept]
            if is_flow:  # a flow (revenue, profit) is shown per quarter
                pick = [r for r in pick if r["period_start"] and
                        timedelta(days=80) <= r["period_end"] - r["period_start"] <= timedelta(days=100)]
            else:
                pick = [r for r in pick if r["period_start"] is None]
            if pick:
                r = max(pick, key=lambda r: (r["period_end"], r["filed"] or date.min))
                out.append({"key": key, "pro": pro, "lite": lite, "concept": f"us-gaap:{concept}",
                            "value": float(r["value"]), "unit": r["unit"],
                            "period_start": r["period_start"].isoformat() if r["period_start"] else None,
                            "period_end": r["period_end"].isoformat(), "form": r["form"],
                            "accession": r["accession"]})
                break
    return out
