"""Check the numbers a model reads out of a filing against the filing's own XBRL.

Pure functions, no I/O. A stated figure matches when the XBRL value, rounded to the precision
the filing printed, equals the stated value rounded the same way: "$5.0 billion" matches
5,039,780,223, "$5.1 billion" does not. A mismatch is always reported, never hidden.
"""

import html
import re
from datetime import date
from html.parser import HTMLParser

# What a figure is about -> the us-gaap concepts companies tag it with (first found wins).
KIND_CONCEPTS: dict[str, list[str]] = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "eps_diluted": ["EarningsPerShareDiluted"],
    "operating_income": ["OperatingIncomeLoss"],
    "total_assets": ["Assets"],
    "total_liabilities": ["Liabilities"],
    "long_term_debt": ["LongTermDebt", "LongTermDebtNoncurrent"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue"],
    "equity": ["StockholdersEquity"],
}
KINDS = [*KIND_CONCEPTS, "other"]

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?|\.\d+")


def printed_sig_digits(text: str) -> int | None:
    """Significant digits of the first number printed in `text`. Trailing zeros of a whole
    number don't count ("$420 million" is 2), digits after a decimal point do ("5.0" is 2)."""
    m = _NUMBER.search(text or "")
    if not m:
        return None
    raw = m.group().replace(",", "")
    whole, dot, frac = raw.partition(".")
    whole = whole.lstrip("0")
    if dot:
        digits = whole + frac if whole else frac.lstrip("0")
    else:
        digits = whole.rstrip("0")
    return max(len(digits), 1)


def _round_sig(x: float, sig: int) -> float:
    return float(f"{x:.{sig}g}")


def figures_match(value: float | None, text_value: str, xbrl_value: float | None) -> bool | None:
    if value is None or xbrl_value is None:
        return None
    sig = printed_sig_digits(text_value)
    if sig is None:
        return None
    return _round_sig(float(xbrl_value), sig) == _round_sig(float(value), sig)


def _day(raw) -> date | None:
    if raw in (None, ""):
        return None
    return raw if isinstance(raw, date) else date.fromisoformat(str(raw)[:10])


def check_figures(stated: list[dict], facts: list[dict]) -> list[dict]:
    """stated: the model's figures {label, kind, text_value, value, period_end}.
    facts: this filing's us-gaap XBRL facts {concept, value, period_end}.
    Returns each figure with concept, xbrl_value and match (True / False / None = nothing to check)."""
    out = []
    for s in stated:
        row = {**s, "concept": None, "xbrl_value": None, "match": None}
        for concept in KIND_CONCEPTS.get(s.get("kind"), []):
            candidates = [f for f in facts if f["concept"] == concept]
            if not candidates:
                continue
            end = _day(s.get("period_end")) or max(f["period_end"] for f in candidates)
            same_day = [f for f in candidates if f["period_end"] == end]
            if not same_day:
                continue
            # a filing can hold the same concept for several spans ending that day (quarter, year to date)
            hit = next((f for f in same_day if figures_match(s.get("value"), s.get("text_value", ""), f["value"])),
                       None)
            best = hit or min(same_day, key=lambda f: abs(float(f["value"]) - float(s.get("value") or 0)))
            row.update(concept=f"us-gaap:{concept}", xbrl_value=float(best["value"]),
                       match=figures_match(s.get("value"), s.get("text_value", ""), best["value"]))
            break
        out.append(row)
    return out


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(raw: bytes, limit: int = 150_000) -> str:
    """A filing's HTML as plain text, whitespace collapsed, cut to `limit` characters."""
    p = _Text()
    p.feed(raw.decode("utf-8", errors="replace"))
    text = re.sub(r"\s+", " ", html.unescape(" ".join(p.parts))).strip()
    text = re.sub(r" ([.,;:])", r"\1", text)
    return text[:limit]
