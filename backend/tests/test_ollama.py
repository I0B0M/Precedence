"""The local summarizer speaks the same JSON as Gemini and is cached the same way; no Ollama needed."""

import json
from pathlib import Path

import httpx
import pytest

from stone.config import Settings
from stone.sources.gemini import ScreenshotUnreadable
from stone.sources.ollama import OllamaClient


def settings(tmp_path: Path) -> Settings:
    return Settings("postgresql://x", "", "", "", "", "", tmp_path)


def client_with(tmp_path: Path, handler) -> OllamaClient:
    return OllamaClient(settings(tmp_path), "qwen2.5:3b", "http://ollama.test", http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_summarize_filing_posts_the_schema_and_caches(tmp_path):
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        calls.append(body)
        return httpx.Response(200, json={"message": {"content": json.dumps({
            "summary": "Revenue fell. Costs rose. Outlook withdrawn. More words.",
            "figures": [{"label": "Revenue", "kind": "revenue", "text_value": "$1.2B", "value": 1.2e9, "period_end": "2026-06-30"},
                        {"label": "Weird", "kind": "nope", "text_value": "?"}, "junk"]})}})

    c = client_with(tmp_path, handler)
    read, cached, when = c.summarize_filing("TEXT", "BX", "8-K", "0001-26-1")
    assert cached is False and when.tzinfo is not None
    assert read.summary.startswith("Revenue fell.")
    assert [f["kind"] for f in read.figures] == ["revenue", "other"]
    assert calls[0]["model"] == "qwen2.5:3b" and calls[0]["stream"] is False
    assert calls[0]["format"]["required"] == ["summary", "figures"]
    assert "BX" in calls[0]["messages"][0]["content"] and "TEXT" in calls[0]["messages"][0]["content"]
    assert str(req_url(calls)) == "1"  # one HTTP call

    again, cached2, _ = c.summarize_filing("TEXT", "BX", "8-K", "0001-26-1")
    assert cached2 is True and again == read and len(calls) == 1  # served from the cache file


def req_url(calls):
    return len(calls)


def test_bad_json_is_unreadable_not_a_crash(tmp_path):
    c = client_with(tmp_path, lambda req: httpx.Response(200, json={"message": {"content": "not json"}}))
    with pytest.raises(ScreenshotUnreadable):
        c.summarize_filing("T", "BX", "8-K", "x")
    c2 = client_with(tmp_path, lambda req: httpx.Response(200, json={"message": {"content": "[1,2]"}}))
    with pytest.raises(ScreenshotUnreadable):
        c2.summarize_filing("T", "BX", "8-K", "y")


def test_http_errors_propagate_as_httpx_errors(tmp_path):
    c = client_with(tmp_path, lambda req: httpx.Response(500, text="boom"))
    with pytest.raises(httpx.HTTPStatusError):
        c.summarize_filing("T", "BX", "8-K", "z")


def test_needs_a_model_name(tmp_path):
    with pytest.raises(ValueError):
        OllamaClient(settings(tmp_path), "")
