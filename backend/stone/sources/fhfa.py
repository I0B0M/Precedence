"""FHFA House Price Index, annual developmental files (ZIP5, county, state).

fhfa.gov/data/hpi/datasets: "Developmental Index; Not Seasonally Adjusted", all-transactions,
cumulative appreciation with 100 in the first recorded year. A period (".") means no index that
year. The ZIP5 file is ~40 MB, so the sheet is streamed, not loaded whole.
"""

import re
import xml.etree.ElementTree as ET
import zipfile
from collections.abc import Iterator
from io import BytesIO

from stone.config import Settings
from stone.fetch import CachedFetcher, RateLimiter

BASE = "https://www.fhfa.gov/hpi/download/annual"
FILES = {"zip5": "hpi_at_zip5.xlsx", "county": "hpi_at_county.xlsx", "state": "hpi_at_state.xlsx"}
AREA_HEADER = {"zip5": "Five-Digit ZIP Code", "county": "FIPS code", "state": "Abbreviation"}
SOURCE = {"zip5": "FHFA House Price Index, 5-digit ZIP (annual, developmental)",
          "county": "FHFA House Price Index, county (annual, developmental)",
          "state": "FHFA House Price Index, state (annual, developmental)"}
_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _col(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref)[0]:
        n = n * 26 + ord(ch) - 64
    return n - 1


def parse_hpi(content: bytes, level: str) -> Iterator[tuple[str, int, float]]:
    """(area, year, index) for every year that has an index. Area: ZIP, county FIPS or state code."""
    z = zipfile.ZipFile(BytesIO(content))
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        for _, el in ET.iterparse(z.open("xl/sharedStrings.xml")):
            if el.tag == _NS + "si":
                shared.append("".join(t.text or "" for t in el.iter(_NS + "t")))
                el.clear()
    cols: dict[str, int] | None = None
    for _, el in ET.iterparse(z.open("xl/worksheets/sheet1.xml")):
        if el.tag != _NS + "row":
            continue
        cells: dict[int, str] = {}
        for c in el.iter(_NS + "c"):
            v, inline = c.find(_NS + "v"), c.find(_NS + "is")
            if c.get("t") == "s" and v is not None:
                cells[_col(c.get("r", "A"))] = shared[int(v.text)]
            elif inline is not None:
                cells[_col(c.get("r", "A"))] = "".join(t.text or "" for t in inline.iter(_NS + "t"))
            elif v is not None:
                cells[_col(c.get("r", "A"))] = v.text
        el.clear()
        if cols is None:
            names = {(txt or "").strip(): i for i, txt in cells.items()}
            if AREA_HEADER[level] in names and "Year" in names and "HPI" in names:
                cols = {"area": names[AREA_HEADER[level]], "year": names["Year"], "hpi": names["HPI"]}
            continue
        area, year, hpi = [(cells.get(cols[k], "") or "").strip() for k in ("area", "year", "hpi")]
        if not area or not year.isdigit() or hpi in ("", "."):
            continue
        try:
            yield area, int(year), float(hpi)
        except ValueError:
            continue


class FhfaClient:
    def __init__(self, settings: Settings, offline: bool = False):
        self.http = CachedFetcher("fhfa", settings.cache_dir, RateLimiter(1),
                                  headers={"User-Agent": "Mozilla/5.0 (compatible; Precedence/0.1; ShellHacks 2026)"},
                                  offline=offline)

    def rows(self, level: str) -> Iterator[tuple[str, int, float]]:
        return parse_hpi(self.http.get(f"{BASE}/{FILES[level]}", FILES[level]), level)
