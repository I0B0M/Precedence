"""US Census Geocoder: a street address -> ZIP, county FIPS and state. No key needed.

geocoding.geo.census.gov/geocoder/geographies/onelineaddress, benchmark and vintage "Current".
Responses are cached by address, so the same lookup never goes out twice.
"""

import hashlib
from dataclasses import dataclass

from stone.config import Settings
from stone.fetch import CachedFetcher, RateLimiter

URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
NAME = "US Census Geocoder"


@dataclass(frozen=True)
class Geocode:
    matched: str
    zip: str | None
    county_fips: str | None
    state: str | None  # two-letter
    lat: float | None = None  # the match's coordinates: Census gives x = longitude, y = latitude
    lon: float | None = None


def parse_geocode(doc: dict) -> Geocode | None:
    matches = ((doc.get("result") or {}).get("addressMatches")) or []
    if not matches:
        return None
    m = matches[0]
    geo = m.get("geographies") or {}
    counties, states = geo.get("Counties") or [], geo.get("States") or []
    comps = m.get("addressComponents") or {}
    xy = m.get("coordinates") or {}
    return Geocode(m.get("matchedAddress", ""), comps.get("zip") or None,
                   counties[0].get("GEOID") if counties else None,
                   (states[0].get("STUSAB") if states else None) or comps.get("state") or None,
                   float(xy["y"]) if xy.get("y") is not None else None,
                   float(xy["x"]) if xy.get("x") is not None else None)


class CensusGeocoder:
    def __init__(self, settings: Settings, offline: bool = False):
        self.http = CachedFetcher("census", settings.cache_dir, RateLimiter(2), offline=offline)

    def geocode(self, address: str) -> Geocode | None:
        import json
        key = f"geocode_{hashlib.sha256(address.strip().lower().encode()).hexdigest()[:24]}.json"
        raw = self.http.get(URL, key, params={"address": address, "benchmark": "Public_AR_Current",
                                             "vintage": "Current_Current", "layers": "Counties,States",
                                             "format": "json"})
        return parse_geocode(json.loads(raw))
