"""ETF holdings from the fund's own SEC filing, Form N-PORT (NPORT-P), for funds whose issuer file we
can't fetch (QQQ: Invesco refuses scripted downloads).

N-PORT is published about two months after the date it reports, so its holdings are older than an
issuer's daily file. The date to show is repPdDate ("date as of which information is reported"),
not repPdEnd, which is the fund's fiscal year end and can be in the future.

Holdings in N-PORT have a name, CUSIP and ISIN but no ticker. A ticker is used only when the CUSIP
matches exactly (e.g. from State Street's SPY file); otherwise the row is keyed by its own identifier
("CUSIP:N07059210"), never by a ticker guessed from the name.
"""

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date

QQQ_CIK = 1067839  # Invesco QQQ Trust, Series 1
QQQ_SOURCE = "SEC N-PORT (Invesco QQQ Trust)"
WEIGHT_RANGE = (0.97, 1.01)  # stock lines must add up to about the whole fund, or nothing is loaded


class NportRejected(ValueError):
    """The filing can't be loaded as holdings (missing date, or weights that don't add up)."""


@dataclass(frozen=True)
class NportHoldings:
    as_of: date  # repPdDate
    fiscal_period_end: date | None  # repPdEnd, kept only so it's never mistaken for as_of
    weights: dict[str, float]  # ticker, or "CUSIP:..." / "ISIN:..." when no exact ticker, -> share of net assets
    names: dict[str, str]
    unmatched: list[str]  # keys that are identifiers, not tickers
    skipped: list[str]  # lines that aren't stocks (cash collateral funds, futures), by name


def _key(cusip: str | None, isin: str | None, lei: str | None) -> str | None:
    for label, v in (("CUSIP", cusip), ("ISIN", isin), ("LEI", lei)):
        if v and v != "N/A":
            return f"{label}:{v}"
    return None


def parse_nport(xml_bytes: bytes, ticker_by_cusip: dict[str, str]) -> NportHoldings:
    root = ET.fromstring(xml_bytes)
    ns = {"n": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {"n": ""}
    text = lambda node, path: (node.findtext(f"n:{path}", namespaces=ns) or "").strip() or None
    gen = root.find(".//n:genInfo", ns)
    if gen is None or not text(gen, "repPdDate"):
        raise NportRejected("No repPdDate in the filing, so its holdings can't be dated.")
    as_of = date.fromisoformat(text(gen, "repPdDate"))
    end = text(gen, "repPdEnd")

    weights: dict[str, float] = {}
    names: dict[str, str] = {}
    unmatched, skipped = [], []
    for s in root.findall(".//n:invstOrSec", ns):
        name = text(s, "name") or ""
        if text(s, "assetCat") != "EC":  # equity, common; the rest is cash collateral, futures and the like
            skipped.append(name)
            continue
        pct = float(text(s, "pctVal") or 0) / 100
        cusip = text(s, "cusip")
        isin_node = s.find("n:identifiers/n:isin", ns)
        key = ticker_by_cusip.get(cusip or "")
        if key is None:
            key = _key(cusip, isin_node.get("value") if isin_node is not None else None, text(s, "lei"))
            if key is None:
                raise NportRejected(f"{name}: no CUSIP, ISIN or LEI to identify it by.")
            unmatched.append(key)
        weights[key] = weights.get(key, 0.0) + pct
        names.setdefault(key, name)

    total = sum(weights.values())
    low, high = WEIGHT_RANGE
    if not low <= total <= high:
        raise NportRejected(f"The stock lines add up to {total:.2%} of the fund, not about 100%; not loading them.")
    return NportHoldings(as_of, date.fromisoformat(end) if end else None, weights, names, unmatched, skipped)
