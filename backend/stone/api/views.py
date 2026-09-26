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


def result_json(r: engine.Result, with_cases: bool = True) -> dict:
    spec = engine.SPECS[r.signal]
    out = {
        "signal": r.signal, "lite": spec.lite, "pro": spec.pro, "horizon": r.horizon,
        "n": r.n, "hits": r.hits, "hit_rate": r.hit_rate,
        "normal_n": r.normal_n, "normal_hits": r.normal_hits, "normal_rate": r.normal_rate,
        "low": r.low, "high": r.high, "label": r.label,
        "firing": {"known_at": r.firing.known_at.isoformat(), "note": r.firing.note} if r.firing else None,
    }
    if with_cases:
        out["cases"] = [{"known_at": c.known_at.isoformat(), "entry_day": c.entry_day.isoformat(),
                         "exit_day": c.exit_day.isoformat(), "ret": c.ret, "hit": c.hit, "note": c.note}
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
