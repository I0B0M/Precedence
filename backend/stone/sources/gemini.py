"""Gemini vision: read holdings rows off a brokerage screenshot.

Gemini only *reads*. Whether the reading is right is decided by
portfolio.reconcile, which checks the rows against the total printed on the
screenshot. The model is never trusted on its own.
"""

import base64
import hashlib
import json
import os
from dataclasses import dataclass

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Set GEMINI_MODEL to the current vision model when connecting. UNVERIFIED default.
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

PROMPT = """This is a screenshot of a brokerage or investing app showing holdings.
Read every holding row exactly as printed. For each row give the ticker symbol,
the number of shares, the price per share if shown, and the market value if shown.
Also give the portfolio total exactly as printed on the screen, if one is shown.
Copy numbers digit for digit. Do not calculate or correct anything.
If a value is not visible, use null."""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "rows": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "symbol": {"type": "STRING"},
            "shares": {"type": "NUMBER", "nullable": True},
            "price": {"type": "NUMBER", "nullable": True},
            "value": {"type": "NUMBER", "nullable": True},
        }, "required": ["symbol"]}},
        "printed_total": {"type": "NUMBER", "nullable": True},
    },
    "required": ["rows"],
}


@dataclass(frozen=True)
class ReadRow:
    symbol: str
    shares: float | None
    price: float | None
    value: float | None


@dataclass(frozen=True)
class ScreenshotRead:
    rows: list[ReadRow]
    printed_total: float | None


def parse_response(doc: dict) -> ScreenshotRead:
    text = doc["candidates"][0]["content"]["parts"][0]["text"]
    body = json.loads(text)
    rows = [ReadRow(r["symbol"].strip().upper(), r.get("shares"), r.get("price"), r.get("value"))
            for r in body.get("rows", [])]
    return ScreenshotRead(rows, body.get("printed_total"))


class GeminiClient:
    def __init__(self, settings: Settings, offline: bool = False):
        if not settings.gemini_api_key and not offline:
            raise NotConnected("GEMINI_API_KEY is not set")
        self.http = CachedFetcher("gemini", settings.cache_dir, RateLimiter(1),
                                  headers={"x-goog-api-key": settings.gemini_api_key},
                                  offline=offline)

    def read_screenshot(self, image: bytes, mime_type: str) -> ScreenshotRead:
        body = {
            "contents": [{"parts": [
                {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image).decode()}},
                {"text": PROMPT},
            ]}],
            "generationConfig": {"responseMimeType": "application/json",
                                 "responseSchema": RESPONSE_SCHEMA, "temperature": 0},
        }
        key = f"screenshot_{MODEL}_{hashlib.sha256(image).hexdigest()[:24]}.json"
        raw = self.http.post_json(f"{BASE}/{MODEL}:generateContent", key, body)
        return parse_response(json.loads(raw))
