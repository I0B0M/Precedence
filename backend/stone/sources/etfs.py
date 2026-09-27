"""ETF holdings from the fund issuer's own daily file (State Street for SPY).

Issuer files are daily; SEC N-PORT lags by up to two months, so we use the issuer and
keep its "as of" date. Only SPY for now: Invesco refuses scripted downloads of QQQ's
file (HTTP 406), so QQQ stays on the board as one whole fund.
"""

import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO

from stone.config import Settings
from stone.fetch import CachedFetcher, RateLimiter

SPDR_URL = ("https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/"
            "holdings-daily-us-en-{etf}.xlsx")
SUPPORTED = ("SPY",)
USER_AGENT = "Mozilla/5.0 (compatible; Stone/0.1; ShellHacks 2026)"
_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


@dataclass(frozen=True)
class Holdings:
    etf: str
    as_of: date
    weights: dict[str, float]  # ticker -> share of the fund, 0..1
    source: str
    names: dict[str, str] = field(default_factory=dict)  # ticker -> the issuer's name for it, e.g. "MICRON TECHNOLOGY INC"
    cusips: dict[str, str] = field(default_factory=dict)  # ticker -> CUSIP ("Identifier"), to match other filings exactly


def xlsx_rows(content: bytes) -> list[list[str | None]]:
    """The first sheet's cell text, row by row. Standard library only (an .xlsx is zipped XML)."""
    z = zipfile.ZipFile(BytesIO(content))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{_NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{_NS}t")))
    rows = []
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(f"{_NS}row"):
        cells: dict[int, str | None] = {}
        for c in row.iter(f"{_NS}c"):
            letters = re.match(r"[A-Z]+", c.get("r", "A"))[0]  # empty cells are skipped, so place by reference
            col = 0
            for ch in letters:
                col = col * 26 + ord(ch) - 64
            v, inline = c.find(f"{_NS}v"), c.find(f"{_NS}is")
            if c.get("t") == "s" and v is not None:
                cells[col - 1] = shared[int(v.text)]
            elif inline is not None:
                cells[col - 1] = "".join(t.text or "" for t in inline.iter(f"{_NS}t"))
            else:
                cells[col - 1] = v.text if v is not None else None
        rows.append([cells.get(i) for i in range(max(cells) + 1)] if cells else [])
    return rows


def parse_spdr(etf: str, content: bytes) -> Holdings:
    rows = xlsx_rows(content)
    as_of = next(datetime.strptime(r[1].replace("As of", "").strip(), "%d-%b-%Y").date()
                 for r in rows if len(r) > 1 and r[0] == "Holdings:" and r[1])
    header = next(i for i, r in enumerate(rows) if "Ticker" in r and "Weight" in r)
    tcol, wcol = rows[header].index("Ticker"), rows[header].index("Weight")
    ncol = rows[header].index("Name") if "Name" in rows[header] else None
    icol = rows[header].index("Identifier") if "Identifier" in rows[header] else None
    weights: dict[str, float] = {}
    names: dict[str, str] = {}
    cusips: dict[str, str] = {}
    for r in rows[header + 1:]:
        if not r or not r[0]:
            break  # the table ends at the first blank row; disclaimers follow
        ticker, weight = (r[tcol] or "").strip(), r[wcol]
        if not ticker or ticker == "-" or weight in (None, "-"):
            continue  # cash and other lines without a stock ticker
        weights[ticker] = weights.get(ticker, 0.0) + float(weight) / 100
        if ncol is not None and ncol < len(r) and (r[ncol] or "").strip():
            names.setdefault(ticker, r[ncol].strip())
        if icol is not None and icol < len(r) and (r[icol] or "").strip() not in ("", "-"):
            cusips.setdefault(ticker, r[icol].strip())
    return Holdings(etf, as_of, {t: w for t, w in weights.items() if w > 0}, "ssga", names, cusips)


class SpdrClient:
    def __init__(self, settings: Settings, offline: bool = False):
        self.fetch = CachedFetcher("ssga", settings.cache_dir, RateLimiter(1),
                                   headers={"User-Agent": USER_AGENT}, offline=offline)
        self.offline = offline

    def holdings(self, etf: str, today: date) -> Holdings:
        """Today's file, cached per day. Offline: the newest cached file."""
        key = f"{etf.lower()}-holdings-{today.isoformat()}.xlsx"
        if self.offline and not self.fetch.path_for(key).exists():
            cached = sorted(self.fetch.dir.glob(f"{etf.lower()}-holdings-*.xlsx"))
            if not cached:
                raise FileNotFoundError(f"offline and no cached {etf} holdings in {self.fetch.dir}")
            return parse_spdr(etf, cached[-1].read_bytes())
        return parse_spdr(etf, self.fetch.get(SPDR_URL.format(etf=etf.lower()), key))
