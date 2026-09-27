"""A local model through Ollama, for filing summaries (docs/v2-plan.md, milestone M3). Same prompt,
same JSON schema and same XBRL figure check as Gemini; only the model differs. Chosen with
STONE_SUMMARY_MODEL="ollama:<model>" (e.g. ollama:qwen2.5:3b) and OLLAMA_URL (default localhost)."""

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx

from stone.config import Settings
from stone.sources.gemini import SUMMARY_PROMPT, FilingRead, ScreenshotUnreadable, filing_read, summary_schema

DEFAULT_URL = "http://127.0.0.1:11434"


class OllamaClient:
    def __init__(self, settings: Settings, model: str, base_url: str | None = None, http: httpx.Client | None = None):
        if not model:
            raise ValueError("Ollama needs a model name, e.g. ollama:qwen2.5:3b")
        self.model_name = model
        self.base_url = (base_url or DEFAULT_URL).rstrip("/")
        self.cache = Path(settings.cache_dir) / "ollama"
        self.http = http or httpx.Client(timeout=300)

    def path_for(self, accession: str) -> Path:
        safe = self.model_name.replace("/", "_").replace(":", "_")
        return self.cache / f"filing_{safe}_{accession}.json"

    def generate(self, prompt: str, schema: dict) -> dict:
        res = self.http.post(f"{self.base_url}/api/chat", json={
            "model": self.model_name, "stream": False, "format": schema,
            "options": {"temperature": 0},
            "messages": [{"role": "user", "content": prompt}],
        })
        res.raise_for_status()
        content = res.json().get("message", {}).get("content", "")
        try:
            body = json.loads(content)
        except (TypeError, ValueError):
            raise ScreenshotUnreadable(f"{self.model_name} didn't return the JSON it was asked for.")
        if not isinstance(body, dict):
            raise ScreenshotUnreadable(f"{self.model_name} didn't return the JSON it was asked for.")
        return body

    def summarize_filing(self, text: str, ticker: str, form: str, accession: str) -> tuple[FilingRead, bool, datetime]:
        """(summary, served from cache?, when it was generated). Cached per filing and model, like Gemini."""
        path = self.path_for(accession)
        if path.exists():
            body = json.loads(path.read_text())
            return filing_read(body), True, datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        body = self.generate(SUMMARY_PROMPT.format(form=form, ticker=ticker, text=text), summary_schema())
        read = filing_read(body)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(body))
        return read, False, datetime.now(timezone.utc)
