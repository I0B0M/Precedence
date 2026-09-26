"""SEC EDGAR: filings list, XBRL financials, Form 4 insider trades.

fetch_* methods go through the cached, rate-limited fetcher (8 req/s; SEC allows 10).
parse_* functions are pure and unit-tested against hand-written files in EDGAR's format.
"""

import json
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

EASTERN = ZoneInfo("America/New_York")

# The submissions JSON writes acceptance times like "2024-11-01T18:04:34.000Z".
# We read that clock time as US Eastern, not UTC: it matches the "Accepted" time on
# the filing's index page, which EDGAR shows in Eastern.
# UNVERIFIED until the first real run: compare one filing against its index page.
ACCEPTANCE_TZ = EASTERN

DATA = "https://data.sec.gov"
ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
TICKER_MAP = "https://www.sec.gov/files/company_tickers.json"


@dataclass(frozen=True)
class Filing:
    accession: str
    form: str
    filed_date: date
    accepted_at: datetime
    report_date: date | None
    primary_doc: str


@dataclass(frozen=True)
class Fact:
    taxonomy: str
    concept: str
    unit: str
    period_start: date | None
    period_end: date
    value: float
    accession: str
    fiscal_year: int | None
    fiscal_period: str | None
    form: str | None
    filed: date | None
    frame: str | None


@dataclass(frozen=True)
class InsiderTrade:
    seq: int
    owner_name: str
    owner_title: str | None
    transaction_date: date | None
    code: str
    shares: float | None
    price: float | None
    acquired_disposed: str | None


# ---------- parse (pure) ----------

def parse_acceptance(raw: str) -> datetime:
    clock = raw.rstrip("Z").split(".")[0]
    return datetime.fromisoformat(clock).replace(tzinfo=ACCEPTANCE_TZ)


def _d(raw: str | None) -> date | None:
    return date.fromisoformat(raw) if raw else None


def parse_filings_block(block: dict) -> list[Filing]:
    """A submissions 'recent' block, or one of the older 'files' pages: parallel arrays."""
    out = []
    report_dates = block.get("reportDate") or []
    for i, acc in enumerate(block["accessionNumber"]):
        out.append(Filing(
            accession=acc,
            form=block["form"][i],
            filed_date=date.fromisoformat(block["filingDate"][i]),
            accepted_at=parse_acceptance(block["acceptanceDateTime"][i]),
            report_date=_d(report_dates[i]) if i < len(report_dates) and report_dates[i] else None,
            primary_doc=block["primaryDocument"][i],
        ))
    return out


def parse_submissions(doc: dict) -> tuple[list[Filing], list[str]]:
    """Returns (recent filings, names of older pages still to fetch)."""
    filings = parse_filings_block(doc["filings"]["recent"])
    older = [f["name"] for f in doc["filings"].get("files", [])]
    return filings, older


def parse_companyfacts(doc: dict) -> list[Fact]:
    out = []
    for taxonomy, concepts in doc.get("facts", {}).items():
        for concept, body in concepts.items():
            for unit, rows in body.get("units", {}).items():
                for r in rows:
                    out.append(Fact(
                        taxonomy=taxonomy, concept=concept, unit=unit,
                        period_start=_d(r.get("start")), period_end=date.fromisoformat(r["end"]),
                        value=float(r["val"]), accession=r["accn"],
                        fiscal_year=r.get("fy"), fiscal_period=r.get("fp"), form=r.get("form"),
                        filed=_d(r.get("filed")), frame=r.get("frame"),
                    ))
    return out


def _text(node: ET.Element | None, path: str) -> str | None:
    if node is None:
        return None
    found = node.find(path)
    if found is None or found.text is None:
        return None
    return found.text.strip() or None


def _num(raw: str | None) -> float | None:
    try:
        return float(raw) if raw is not None else None
    except ValueError:
        return None


def parse_form4(xml_bytes: bytes) -> list[InsiderTrade]:
    """Non-derivative transactions only (actual shares bought or sold)."""
    root = ET.fromstring(xml_bytes)
    owners = root.findall("reportingOwner")
    name = "; ".join(filter(None, (_text(o, "reportingOwnerId/rptOwnerName") for o in owners)))
    title = next(filter(None, (_text(o, "reportingOwnerRelationship/officerTitle") for o in owners)), None)
    if title is None and any(_text(o, "reportingOwnerRelationship/isDirector") in ("1", "true") for o in owners):
        title = "Director"
    out = []
    for seq, tx in enumerate(root.findall("nonDerivativeTable/nonDerivativeTransaction")):
        code = _text(tx, "transactionCoding/transactionCode")
        if not code:
            continue
        out.append(InsiderTrade(
            seq=seq, owner_name=name, owner_title=title,
            transaction_date=_d(_text(tx, "transactionDate/value")),
            code=code,
            shares=_num(_text(tx, "transactionAmounts/transactionShares/value")),
            price=_num(_text(tx, "transactionAmounts/transactionPricePerShare/value")),
            acquired_disposed=_text(tx, "transactionAmounts/transactionAcquiredDisposedCode/value"),
        ))
    return out


def form4_xml_name(primary_doc: str) -> str:
    """Submissions list the styled copy ('xslF345X05/form4.xml'); the raw XML drops that folder."""
    return primary_doc.split("/", 1)[1] if primary_doc.startswith("xsl") else primary_doc


# ---------- fetch (cached) ----------

class SecClient:
    def __init__(self, settings: Settings, offline: bool = False):
        if not settings.sec_user_agent and not offline:
            raise NotConnected("SEC_USER_AGENT is not set (SEC requires a contact email)")
        self.http = CachedFetcher(
            "sec", settings.cache_dir, RateLimiter(8),
            headers={"User-Agent": settings.sec_user_agent, "Accept-Encoding": "gzip, deflate"},
            offline=offline,
        )

    def ticker_map(self) -> dict[str, int]:
        doc = json.loads(self.http.get(TICKER_MAP, "company_tickers.json"))
        return {row["ticker"]: int(row["cik_str"]) for row in doc.values()}

    def filings(self, cik: int, since: date) -> list[Filing]:
        key = f"CIK{cik:010d}"
        doc = json.loads(self.http.get(f"{DATA}/submissions/{key}.json", f"submissions_{key}.json"))
        filings, older = parse_submissions(doc)
        for name in older:
            if min(f.filed_date for f in filings) < since:
                break
            page = json.loads(self.http.get(f"{DATA}/submissions/{name}", f"submissions_{name}"))
            filings += parse_filings_block(page)
        return [f for f in filings if f.filed_date >= since]

    def companyfacts(self, cik: int) -> list[Fact]:
        key = f"CIK{cik:010d}"
        raw = self.http.get(f"{DATA}/api/xbrl/companyfacts/{key}.json", f"companyfacts_{key}.json")
        return parse_companyfacts(json.loads(raw))

    def form4(self, cik: int, filing: Filing) -> list[InsiderTrade]:
        folder = filing.accession.replace("-", "")
        doc = form4_xml_name(filing.primary_doc)
        raw = self.http.get(f"{ARCHIVES}/{cik}/{folder}/{doc}", f"form4_{filing.accession}.xml")
        return parse_form4(raw)
