"""Turns database rows and engine results into the JSON the frontend reads."""

from datetime import date, timedelta

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


def result_json(r: engine.Result, with_cases: bool = True, fdr10: dict[str, bool] | None = None) -> dict:
    """fdr10: this stock's verdicts from the latest scan's Benjamini-Hochberg run (scan.fdr10_by_signal)."""
    spec = engine.ALL_SPECS[r.signal]
    out = {
        "signal": r.signal, "lite": spec.lite, "pro": spec.pro, "horizon": r.horizon,
        "vs_market": spec.vs_market,  # true: a hit means "did worse than the market", not "was lower"
        "n": r.n, "hits": r.hits, "hit_rate": r.hit_rate,
        "normal_n": r.normal_n, "normal_hits": r.normal_hits, "normal_rate": r.normal_rate,
        "low": r.low, "high": r.high, "label": r.label,
        "firing": {"known_at": r.firing.known_at.isoformat(), "note": r.firing.note} if r.firing else None,
        "note": r.note,
        "fdr10_survives": (fdr10 or {}).get(r.signal),  # None: not in that run
    }
    if r.holdout:
        half = lambda h: {"n": h.n, "hits": h.hits, "hit_rate": h.hit_rate, "normal_rate": h.normal_rate,
                          "normal_n": h.normal_n, "label": h.label}
        out["holdout"] = {"first": half(r.holdout.first), "second": half(r.holdout.second),
                          "held_up": r.holdout.held_up,
                          "verdict": r.holdout.verdict,  # "held up" | "did not hold" | "too few cases to check"
                          "split_day": r.holdout.split_day.isoformat() if r.holdout.split_day else None,
                          "excluded": excluded_json(r.holdout, r.horizon)}
    else:
        out["holdout"] = None
    if with_cases:
        out["cases"] = [{"known_at": c.known_at.isoformat(), "entry_day": c.entry_day.isoformat(),
                         "exit_day": c.exit_day.isoformat(), "ret": c.ret, "market_ret": c.market_ret,
                         "hit": c.hit, "note": c.note}
                        for c in r.cases]
    return out


def excluded_json(h: engine.Holdout, horizon: int) -> dict:
    """The full-history cases neither half holds, and why. The reason is only given when it is true of every one."""
    ex, split = h.excluded, h.split_day
    crosses = bool(ex) and split is not None and all(c.entry_day < split <= c.exit_day for c in ex)
    reason = None
    if crosses:
        reason = (f"{'Its' if len(ex) == 1 else 'Their'} {horizon}-trading-day window starts before the split "
                  f"({split.isoformat()}) and ends after it, so neither half has the whole window to measure.")
    elif ex:
        reason = "Not in either half's run of the test."
    return {"n": len(ex), "hits": sum(c.hit for c in ex), "reason": reason,
            "cases": [{"known_at": c.known_at.isoformat(), "entry_day": c.entry_day.isoformat(),
                       "exit_day": c.exit_day.isoformat(), "hit": c.hit} for c in ex]}


WITH_MARKET_BAND = 0.005  # within half a percentage point of the market's one-day move = "with the market"


def vs_market_words(stock: float | None, market: float | None, band: float = WITH_MARKET_BAND) -> str | None:
    """How big a stock's one-day move was next to the market's. Size only, and never a reason for it."""
    if stock is None or market is None:
        return None
    if round(abs(stock - market), 6) <= band:  # rounded so an exact half point counts as "with"
        return "with the market"
    return "more than the market" if abs(stock) > abs(market) else "less than the market"


# The `source` values stored with each row, in words for the page
SOURCE_NAMES = {"alpaca-iex": "Alpaca market data (IEX feed)", "sec": "SEC EDGAR", "fred": "FRED, St. Louis Fed",
                "sample": "Sample data (made up)"}


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
