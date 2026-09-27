import io
import json
import zipfile
from pathlib import Path

import pytest

from stone import homes
from stone.sources import census, fhfa

FIX = Path(__file__).parent / "fixtures"


def test_census_geocoder_gives_zip_county_and_state():
    g = census.parse_geocode(json.loads((FIX / "census_geocode_miami.json").read_text()))
    assert g.matched == "3500 PAN AMERICAN DR, MIAMI, FL, 33133"
    assert (g.zip, g.county_fips, g.state) == ("33133", "12086", "FL")
    assert (g.lat, g.lon) == (25.728662483198, -80.23499374077)  # Census: y = latitude, x = longitude


def test_census_geocoder_without_a_match_is_none():
    assert census.parse_geocode({"result": {"addressMatches": []}}) is None


def xlsx(rows: list[list]) -> bytes:
    """A tiny sheet in FHFA's layout: five lines of notes, then a header on row 6."""
    cells = []
    for r, row in enumerate(rows, start=1):
        cs = "".join(f'<c r="{chr(65 + i)}{r}" t="inlineStr"><is><t>{v}</t></is></c>' for i, v in enumerate(row)
                     if v is not None)
        cells.append(f'<row r="{r}">{cs}</row>')
    sheet = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + "".join(cells) + "</sheetData></worksheet>")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return buf.getvalue()


def test_fhfa_zip5_file_parses_area_year_index_and_skips_missing():
    notes = [["HPI for Five-Digit ZIP Codes"], [None], ["notes"], ["Last updated: March 31, 2026."], ["NSA"]]
    header = [["Five-Digit ZIP Code", "Year", "Annual Change (%)", "HPI", "HPI with 1990 base", "HPI with 2000 base"]]
    data = [["33133", "2015", "8.1", "250.5", "200", "150"], ["33133", "2016", ".", ".", ".", "."],
            ["33133", "2025", "3.0", "501.0", "400", "300"]]
    rows = list(fhfa.parse_hpi(xlsx(notes + header + data), "zip5"))
    assert rows == [("33133", 2015, 250.5), ("33133", 2025, 501.0)]  # "." means no index that year


def test_fhfa_county_and_state_files_use_their_own_columns():
    notes = [["x"], [None], ["x"], ["x"], ["x"]]
    county = [["State", "County", "FIPS code", "Year", "Annual Change (%)", "HPI", "HPI with 1990 base", "HPI with 2000 base"],
              ["FL", "Miami-Dade", "12086", "2020", "5", "300.0", "1", "1"]]
    state = [["State", "Abbreviation", "FIPS", "Year", "Annual Change (%)", "HPI", "HPI with 1990 base", "HPI with 2000 base"],
             ["Florida", "FL", "12", "2020", "5", "280.0", "1", "1"]]
    assert list(fhfa.parse_hpi(xlsx(notes + county), "county")) == [("12086", 2020, 300.0)]
    assert list(fhfa.parse_hpi(xlsx(notes + state), "state")) == [("FL", 2020, 280.0)]


def test_estimate_is_paid_times_the_index_change_at_the_finest_level_that_covers_both_years():
    series = {"zip5": {2015: 250.0, 2025: 500.0}, "county": {2015: 100.0, 2025: 150.0}}
    e = homes.estimate(300_000, 2015, series)
    assert e["estimate"] == pytest.approx(600_000) and e["index_change"] == pytest.approx(1.0)
    assert e["index_level"] == "zip5" and e["index_from"] == {"year": 2015, "value": 250.0}
    assert e["index_to"] == {"year": 2025, "value": 500.0} and e["as_of"] == "2025" and e["note"] is None


def test_estimate_falls_back_to_county_then_state_and_says_so():
    series = {"zip5": {2020: 300.0, 2025: 400.0}, "county": {2010: 100.0, 2025: 180.0}, "state": {2010: 90.0, 2025: 150.0}}
    e = homes.estimate(200_000, 2010, series)  # the ZIP index starts after 2010
    assert e["index_level"] == "county" and e["estimate"] == pytest.approx(360_000)
    assert "county" in e["note"].lower() and "zip" in e["note"].lower()
    e = homes.estimate(200_000, 2010, {"zip5": {}, "state": series["state"]})
    assert e["index_level"] == "state" and e["estimate"] == pytest.approx(200_000 * 150 / 90)


def test_bought_after_the_latest_index_year_is_valued_at_what_was_paid():
    e = homes.estimate(450_000, 2026, {"zip5": {2015: 250.0, 2025: 500.0}})
    assert e["estimate"] == 450_000 and e["index_change"] is None
    assert "2025" in e["note"] and e["as_of"] == "2025"


def test_no_index_anywhere_says_so_instead_of_guessing():
    e = homes.estimate(300_000, 1970, {"zip5": {2015: 250.0}})
    assert e["estimate"] is None and e["index_level"] is None and "no fhfa index" in e["note"].lower()
