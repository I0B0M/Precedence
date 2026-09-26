"""Daily prices from Alpaca market data (free IEX feed), many symbols per request.

Alpaca returns nothing unless start and end are both given. Results page with
next_page_token when there are more bars than `limit`.
"""

import json
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

EASTERN = ZoneInfo("America/New_York")
DATA = "https://data.alpaca.markets/v2/stocks/bars"


@dataclass(frozen=True)
class Bar:
    day: date
    open: float
    high: float
    low: float
    close: float
    volume: float | None


def parse_bars(doc: dict) -> tuple[dict[str, list[Bar]], str | None]:
    """One page -> ({symbol: bars}, next_page_token). Bar time is midnight US Eastern, in UTC."""
    out: dict[str, list[Bar]] = {}
    for sym, rows in (doc.get("bars") or {}).items():
        out[sym] = [Bar(datetime.fromisoformat(r["t"].replace("Z", "+00:00")).astimezone(EASTERN).date(),
                        float(r["o"]), float(r["h"]), float(r["l"]), float(r["c"]), r.get("v"))
                    for r in rows]
    return out, doc.get("next_page_token")


class AlpacaPrices:
    def __init__(self, settings: Settings, offline: bool = False):
        if not (settings.alpaca_api_key and settings.alpaca_api_secret) and not offline:
            raise NotConnected("ALPACA_API_KEY / ALPACA_API_SECRET are not set")
        self.http = CachedFetcher(
            "alpaca", settings.cache_dir, RateLimiter(3),  # Alpaca allows 200/min
            headers={"APCA-API-KEY-ID": settings.alpaca_api_key, "APCA-API-SECRET-KEY": settings.alpaca_api_secret},
            offline=offline,
        )

    def daily(self, symbols: list[str], start: date, end: date) -> dict[str, list[Bar]]:
        out: dict[str, list[Bar]] = {s: [] for s in symbols}
        token, page = None, 0
        while True:
            params = {"symbols": ",".join(symbols), "timeframe": "1Day", "start": str(start), "end": str(end),
                      "limit": 10000, "feed": "iex", "adjustment": "split"}
            if token:
                params["page_token"] = token
            key = f"bars_{'-'.join(symbols)}_{start}_{end}_p{page}.json"
            bars, token = parse_bars(json.loads(self.http.get(DATA, key, params=params)))
            for sym, rows in bars.items():
                out.setdefault(sym, []).extend(rows)
            if not token:
                break
            page += 1
        return {s: sorted(b, key=lambda x: x.day) for s, b in out.items()}
