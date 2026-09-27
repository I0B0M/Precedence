"""Gemini: read holdings rows off a brokerage screenshot, and summarize a filing.

Gemini only *reads*. Whether the reading is right is decided elsewhere:
portfolio.reconcile checks screenshot rows against the printed total, and
figures.check_figures checks a summary's numbers against the filing's own XBRL.
The model is never trusted on its own.
"""

import base64
import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Stable Flash model with image input, structured output and a free tier, per
# ai.google.dev/gemini-api/docs/models and /pricing (checked 2026-09-26). The 2.5 models
# are limited to accounts that used them before, so a new key would fail on them.
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

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


class ScreenshotUnreadable(ValueError):
    """Gemini answered, but not with holdings we can use."""


def parse_response(doc: dict) -> ScreenshotRead:
    blocked = (doc.get("promptFeedback") or {}).get("blockReason")
    if blocked or not doc.get("candidates"):
        raise ScreenshotUnreadable(f"Gemini would not read this image ({blocked or 'no answer'}).")
    try:
        body = json.loads(doc["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        reason = doc["candidates"][0].get("finishReason", "no holdings table")
        raise ScreenshotUnreadable(f"Couldn't find holdings in this screenshot ({reason}).") from None
    rows = [ReadRow(r["symbol"].strip().upper(), r.get("shares"), r.get("price"), r.get("value"))
            for r in body.get("rows", []) if (r.get("symbol") or "").strip()]  # no ticker, no use
    return ScreenshotRead(rows, body.get("printed_total"))


# ---------- filing summary ----------

SUMMARY_PROMPT = """Below is the text of an SEC {form} filing by {ticker}.
1. In at most 3 short sentences, in plain words a non-expert understands, say what this filing
   tells an investor. No jargon, no advice.
2. List up to 8 key financial figures the text itself prints. For each: a short label; kind, from
   the allowed list (use "other" if none fits); text_value copied exactly as printed (e.g.
   "$5.0 billion"); value as a plain number in full units (dollars, not millions; per-share amounts
   in dollars; losses negative); period_end as the date that figure's period ends (YYYY-MM-DD),
   or null if the text doesn't say.
Copy numbers as printed. Do not calculate, estimate or correct anything.

FILING TEXT:
{text}"""


def summary_schema() -> dict:
    from stone.figures import KINDS
    return {
        "type": "OBJECT",
        "properties": {
            "summary": {"type": "STRING"},
            "figures": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                "label": {"type": "STRING"},
                "kind": {"type": "STRING", "enum": KINDS},
                "text_value": {"type": "STRING"},
                "value": {"type": "NUMBER", "nullable": True},
                "period_end": {"type": "STRING", "nullable": True},
            }, "required": ["label", "kind", "text_value"]}},
        },
        "required": ["summary", "figures"],
    }


@dataclass(frozen=True)
class FilingRead:
    summary: str
    figures: list[dict]  # {label, kind, text_value, value, period_end}


def first_sentences(text: str, n: int) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])


def parse_summary_response(doc: dict) -> FilingRead:
    from stone.figures import KINDS
    blocked = (doc.get("promptFeedback") or {}).get("blockReason")
    if blocked or not doc.get("candidates"):
        raise ScreenshotUnreadable(f"Gemini would not read this filing ({blocked or 'no answer'}).")
    try:
        body = json.loads(doc["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        reason = doc["candidates"][0].get("finishReason", "no summary")
        raise ScreenshotUnreadable(f"Gemini didn't return a summary ({reason}).") from None
    figures = [{"label": f.get("label", ""), "kind": f.get("kind") if f.get("kind") in KINDS else "other",
                "text_value": f.get("text_value", ""), "value": f.get("value"), "period_end": f.get("period_end")}
               for f in body.get("figures", [])]
    return FilingRead(body.get("summary", "").strip(), figures)


def connected(settings: Settings) -> bool:
    """Whether Gemini calls (screenshot import, filing summaries) can run at all."""
    return bool(settings.gemini_api_key)


class GeminiClient:
    def __init__(self, settings: Settings, offline: bool = False):
        if not connected(settings) and not offline:
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

    def summarize_filing(self, text: str, ticker: str, form: str, accession: str) -> tuple[FilingRead, bool, datetime]:
        """(summary, served from cache?, when it was generated). Cached per filing and model."""
        body = {
            "contents": [{"parts": [{"text": SUMMARY_PROMPT.format(form=form, ticker=ticker, text=text)}]}],
            "generationConfig": {"responseMimeType": "application/json",
                                 "responseSchema": summary_schema(), "temperature": 0},
        }
        key = f"filing_{MODEL}_{accession}.json"
        path = self.http.path_for(key)
        cached = path.exists()
        raw = self.http.post_json(f"{BASE}/{MODEL}:generateContent", key, body)
        generated = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        return parse_summary_response(json.loads(raw)), cached, generated
