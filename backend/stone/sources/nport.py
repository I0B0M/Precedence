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


@dataclass(frozen=True)
class SeriesFund:
    """A fund that is one series of a larger trust: its N-PORTs are found by series, not by the trust's CIK.
    Series ids from SEC's company_tickers_mf.json."""
    etf: str
    cik: int  # the trust
    series_id: str
    source: str


SERIES_FUNDS = {
    "VOO": SeriesFund("VOO", 36405, "S000002839", "SEC N-PORT (Vanguard 500 Index Fund)"),  # VOO is its ETF class
    "IVV": SeriesFund("IVV", 1100663, "S000004310", "SEC N-PORT (iShares Core S&P 500 ETF)"),
}
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


def _root(xml_bytes: bytes):
    root = ET.fromstring(xml_bytes)
    ns = {"n": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {"n": ""}
    text = lambda node, path: (node.findtext(f"n:{path}", namespaces=ns) or "").strip() or None
    return root, ns, text


def cusips_by_isin(xml_bytes: bytes) -> dict[str, str]:
    """ISIN -> CUSIP for every line that gives both. iShares reports some non-US stocks by ISIN only; another fund's
    filing for the same stocks (Vanguard's lists both) lets them be matched exactly instead of guessed."""
    root, ns, text = _root(xml_bytes)
    out = {}
    for s in root.findall(".//n:invstOrSec", ns):
        isin, cusip = s.find("n:identifiers/n:isin", ns), text(s, "cusip")
        if isin is not None and isin.get("value") and cusip and cusip != "N/A":
            out[isin.get("value")] = cusip
    return out


def parse_nport(xml_bytes: bytes, ticker_by_cusip: dict[str, str], cusip_by_isin: dict[str, str] | None = None,
                series_id: str | None = None) -> NportHoldings:
    """series_id: the fund's SEC series (e.g. IVV S000004310); a trust files one N-PORT per series, so a filing
    for any other series is refused."""
    root, ns, text = _root(xml_bytes)
    cusip_by_isin = cusip_by_isin or {}
    gen = root.find(".//n:genInfo", ns)
    if series_id and (gen is None or text(gen, "seriesId") != series_id):
        raise NportRejected(f"This filing is for series {text(gen, 'seriesId') if gen is not None else None}, "
                            f"not {series_id}.")
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
        isin = isin_node.get("value") if isin_node is not None else None
        if (not cusip or cusip == "N/A") and isin in cusip_by_isin:
            cusip = cusip_by_isin[isin]
        key = ticker_by_cusip.get(cusip or "")
        if key is None:
            key = _key(cusip, isin, text(s, "lei"))
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
