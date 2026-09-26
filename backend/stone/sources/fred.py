"""FRED: the 10-year Treasury yield (DGS10), one value per business day."""

import json
from datetime import date

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

BASE = "https://api.stlouisfed.org/fred/series/observations"


def parse_observations(doc: dict) -> list[tuple[date, float]]:
    """FRED writes '.' for days with no value (holidays); those are dropped."""
    out = []
    for o in doc.get("observations", []):
        if o["value"] not in (".", ""):
            out.append((date.fromisoformat(o["date"]), float(o["value"])))
    return out


class FredClient:
    def __init__(self, settings: Settings, offline: bool = False):
        if not settings.fred_api_key and not offline:
            raise NotConnected("FRED_API_KEY is not set")
        self.key = settings.fred_api_key
        self.http = CachedFetcher("fred", settings.cache_dir, RateLimiter(2), offline=offline)

    def series(self, series_id: str, start: date) -> list[tuple[date, float]]:
        params = {"series_id": series_id, "api_key": self.key, "file_type": "json",
                  "observation_start": str(start)}
        raw = self.http.get(BASE, f"{series_id}_{start}.json", params=params)
        return parse_observations(json.loads(raw))
