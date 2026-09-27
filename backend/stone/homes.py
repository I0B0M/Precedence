"""A home's estimated value: what you paid × how much the FHFA house price index moved since.

Pure function, no I/O. Uses the finest FHFA series that has an index for both the purchase year and
the latest year: 5-digit ZIP, then county, then state, and says which in `note`. It is an estimate of
how prices moved in the area, not an appraisal of the house.
"""

LEVELS = ("zip5", "county", "state")
LEVEL_WORDS = {"zip5": "ZIP code", "county": "county", "state": "state"}
METHOD = "paid × FHFA ZIP5 index change"


def estimate(paid: float, bought_year: int, series: dict[str, dict[int, float]]) -> dict:
    """series: {level: {year: index}} for this home's ZIP / county / state (any may be missing)."""
    latest = max((y for s in series.values() for y in s), default=None)
    base = {"paid": paid, "bought_year": bought_year, "estimate": None, "index_change": None, "index_from": None,
            "index_to": None, "index_level": None, "as_of": str(latest) if latest else None, "note": None}
    if latest is not None and bought_year > latest:
        return {**base, "estimate": paid,
                "note": f"Bought after {latest}, the latest year FHFA has an index for, so this is what you paid."}
    for level in LEVELS:
        s = series.get(level) or {}
        if bought_year not in s or not s:
            continue
        to_year = max(s)
        change = s[to_year] / s[bought_year] - 1
        note = None
        if level != "zip5":
            note = (f"No FHFA index for this ZIP code in {bought_year}, so the {LEVEL_WORDS[level]} index is used.")
        return {**base, "estimate": paid * s[to_year] / s[bought_year], "index_change": change,
                "index_from": {"year": bought_year, "value": s[bought_year]},
                "index_to": {"year": to_year, "value": s[to_year]}, "index_level": level,
                "as_of": str(to_year), "note": note}
    return {**base, "note": f"No FHFA index covers {bought_year} for this area, so there's no estimate."}
