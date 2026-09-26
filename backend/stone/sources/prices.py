"""Daily prices from Massive (formerly Polygon). Free tier: 5 requests/minute, 2 years.

One request per ticker returns every daily bar, split-adjusted.
"""

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

EASTERN = ZoneInfo("America/New_York")
# Massive kept Polygon's REST paths. UNVERIFIED until the first real run.
BASE = "https://api.massive.com"


@dataclass(frozen=True)
class Bar:
    day: date
    open: float
    high: float
    low: float
    close: float
    volume: float | None


def parse_aggs(doc: dict) -> list[Bar]:
    """Bar timestamps are ms since epoch at the start of the trading day, US Eastern."""
    bars = []
    for r in doc.get("results") or []:
        day = datetime.fromtimestamp(r["t"] / 1000, tz=timezone.utc).astimezone(EASTERN).date()
        bars.append(Bar(day, float(r["o"]), float(r["h"]), float(r["l"]), float(r["c"]), r.get("v")))
    return sorted(bars, key=lambda b: b.day)


class MassiveClient:
    def __init__(self, settings: Settings, offline: bool = False):
        if not settings.massive_api_key and not offline:
            raise NotConnected("MASSIVE_API_KEY is not set")
        self.key = settings.massive_api_key
        self.http = CachedFetcher("massive", settings.cache_dir, RateLimiter(5 / 60), offline=offline)

    def daily(self, ticker: str, start: date, end: date) -> list[Bar]:
        url = f"{BASE}/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}"
        params = {"adjusted": "true", "sort": "asc", "limit": 50000, "apiKey": self.key}
        raw = self.http.get(url, f"aggs_{ticker}_{start}_{end}.json", params=params)
        return parse_aggs(json.loads(raw))
