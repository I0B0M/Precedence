"""Gemini: read holdings rows off a brokerage screenshot, and summarize a filing.

Gemini only *reads*. Whether the reading is right is decided elsewhere:
portfolio.reconcile checks screenshot rows against the printed total, and
figures.check_figures checks a summary's numbers against the filing's own XBRL.
The model is never trusted on its own.

Requests follow ai.google.dev/gemini-api/docs as checked on 2026-09-26: JSON output through
generationConfig.responseFormat (a JSON Schema), a low thinking level because these are reading
jobs, and no temperature (deprecated; on 3.x models a value under 1.0 can make answers loop).
A model or project that rejects that request (HTTP 400; the 2.5 models don't take thinkingLevel)
gets it again in the older format, responseMimeType + responseSchema, which is still served.
"""

import base64
import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from stone.config import NotConnected, Settings
from stone.fetch import CachedFetcher, RateLimiter

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# Stable Flash model with image input, structured output and a free tier, per
# ai.google.dev/gemini-api/docs/models and /pricing (checked 2026-09-26). The 2.5 models
# are limited to accounts that used them before, so a new key would fail on them.
# gemini-3.5-flash-lite is the other current pick, cheaper and meant for simple extraction.
DEFAULT_MODEL = "gemini-3.8-flash"


def model_from_env() -> str:
    return os.getenv("GEMINI_MODEL") or DEFAULT_MODEL  # an empty GEMINI_MODEL= in .env means the default


MODEL = model_from_env()
# Formats Gemini reads inline (ai.google.dev/gemini-api/docs/image-understanding)
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"}

PROMPT = """This is a screenshot of a brokerage or investing app showing holdings.
Read every holding row exactly as printed. For each row give the ticker symbol,
the number of shares, the price per share if shown, and the market value if shown.
If the screen shows a cash balance that is counted in the total, add it as one more
row with symbol CASH, its amount as value, and shares and price null.
Also give the portfolio total exactly as printed on the screen, if one is shown.
Copy numbers digit for digit. Do not calculate or correct anything.
If a value is not visible, use null."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "rows": {"type": "array", "items": {"type": "object", "properties": {
            "symbol": {"type": "string"},
            "shares": {"type": ["number", "null"]},
            "price": {"type": ["number", "null"]},
            "value": {"type": ["number", "null"]},
        }, "required": ["symbol"]}},
        "printed_total": {"type": ["number", "null"]},
    },
    "required": ["rows"],
}


def generation_config(schema: dict) -> dict:
    return {"responseFormat": {"text": {"mimeType": "application/json", "schema": schema}},
            "thinkingConfig": {"thinkingLevel": "low"}}


def legacy_schema(schema: dict) -> dict:
    """The same schema in the older responseSchema dialect: upper-case types, `nullable` for null."""
    out = {}
    for k, v in schema.items():
        if k == "type":
            types = v if isinstance(v, list) else [v]
            out["type"] = next(t for t in types if t != "null").upper()
            if "null" in types:
                out["nullable"] = True
        elif k == "properties":
            out[k] = {name: legacy_schema(p) for name, p in v.items()}
        elif k == "items":
            out[k] = legacy_schema(v)
        else:
            out[k] = v
    return out


def legacy_generation_config(schema: dict) -> dict:
    return {"responseMimeType": "application/json", "responseSchema": legacy_schema(schema)}


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
    """Gemini answered, but not with something we can use (a screenshot's holdings or a filing's summary)."""


def response_text(doc: dict, what: str) -> str:
    """The answer: every text part of the first candidate that isn't a thought, joined. A thinking
    model can split its answer across parts, so reading only the first part could miss it."""
    blocked = (doc.get("promptFeedback") or {}).get("blockReason")
    if blocked or not doc.get("candidates"):
        raise ScreenshotUnreadable(f"Gemini would not read this {what} ({blocked or 'no answer'}).")
    candidate = doc["candidates"][0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not text.strip():
        raise ScreenshotUnreadable(f"Gemini stopped before answering ({candidate.get('finishReason') or 'empty answer'}).")
    return text


def answer_json(doc: dict, what: str) -> dict:
    text = response_text(doc, what)
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        reason = doc["candidates"][0].get("finishReason") or "not JSON"
        raise ScreenshotUnreadable(f"Gemini's answer about this {what} was cut off or malformed ({reason}).") from None
    if not isinstance(body, dict):
        raise ScreenshotUnreadable(f"Gemini's answer about this {what} wasn't what we asked for.")
    return body


def clean_symbol(raw: str) -> str:
    """ "$aapl " -> "AAPL"; "BRK-B", "BRK/B" and "BRK B" -> "BRK.B" (how Stone writes share classes)."""
    s = raw.strip().upper().lstrip("$").strip()
    return re.sub(r"^([A-Z]+)[-/ ]([A-Z])$", r"\1.\2", s)


def parse_response(doc: dict) -> ScreenshotRead:
    body = answer_json(doc, "image")
    rows = [ReadRow(clean_symbol(r["symbol"]), r.get("shares"), r.get("price"), r.get("value"))
            for r in body.get("rows", []) if clean_symbol(r.get("symbol") or "")]  # no ticker, no use
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
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "figures": {"type": "array", "items": {"type": "object", "properties": {
                "label": {"type": "string"},
                "kind": {"type": "string", "enum": KINDS},
                "text_value": {"type": "string"},
                "value": {"type": ["number", "null"]},
                "period_end": {"type": ["string", "null"]},
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
    body = answer_json(doc, "filing")
    figures = [{"label": f.get("label", ""), "kind": f.get("kind") if f.get("kind") in KINDS else "other",
                "text_value": f.get("text_value", ""), "value": f.get("value"), "period_end": f.get("period_end")}
               for f in body.get("figures", []) if isinstance(f, dict)]
    return FilingRead(str(body.get("summary", "")).strip(), figures)


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

    def generate(self, key: str, parts: list[dict], schema: dict, timeout: float) -> dict:
        """POST generateContent, cached under `key`. On HTTP 400, once more in the older request format."""
        url = f"{BASE}/{MODEL}:generateContent"
        body = {"contents": [{"parts": parts}], "generationConfig": generation_config(schema)}
        try:
            raw = self.http.post_json(url, key, body, timeout=timeout)
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 400:
                raise
            raw = self.http.post_json(url, key, {**body, "generationConfig": legacy_generation_config(schema)},
                                      timeout=timeout)
        return json.loads(raw)

    def parsed(self, key: str, doc: dict, parse):
        """parse(doc), but an answer we can't use isn't kept in the cache, so trying again asks again."""
        try:
            return parse(doc)
        except ScreenshotUnreadable:
            self.http.path_for(key).unlink(missing_ok=True)
            raise

    def read_screenshot(self, image: bytes, mime_type: str) -> ScreenshotRead:
        key = f"screenshot_{MODEL}_{hashlib.sha256(image).hexdigest()[:24]}.json"
        parts = [{"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image).decode()}},
                 {"text": PROMPT}]
        return self.parsed(key, self.generate(key, parts, RESPONSE_SCHEMA, timeout=60), parse_response)

    def summarize_filing(self, text: str, ticker: str, form: str, accession: str) -> tuple[FilingRead, bool, datetime]:
        """(summary, served from cache?, when it was generated). Cached per filing and model."""
        key = f"filing_{MODEL}_{accession}.json"
        path = self.http.path_for(key)
        cached = path.exists()
        parts = [{"text": SUMMARY_PROMPT.format(form=form, ticker=ticker, text=text)}]
        read = self.parsed(key, self.generate(key, parts, summary_schema(), timeout=120), parse_summary_response)
        return read, cached, datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
