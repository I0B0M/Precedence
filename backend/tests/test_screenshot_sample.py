"""The screenshot import without a Gemini key: a screen that was read once (the sample, say) is read again from the
saved reading; anything else says it needs the key. A saved reading is the model's own answer, never one we wrote."""

import json
import os
from datetime import date
from pathlib import Path

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://localhost:5432/stone_test")

from fastapi.testclient import TestClient  # noqa: E402

from stone import db  # noqa: E402
from stone.api import main as m  # noqa: E402
from stone.ingest import sample  # noqa: E402
from stone.sources import gemini  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "demo_screenshot.png"
PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples" / "demo_screenshot.png"


@pytest.fixture(scope="module")
def client():
    conn = db.connect(os.environ["DATABASE_URL"])
    db.apply_schema(conn)
    sample.seed(conn, date(2026, 9, 26))
    conn.close()
    return TestClient(app=m.app)


@pytest.fixture
def no_key(monkeypatch, tmp_path):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("STONE_CACHE_DIR", str(tmp_path))
    return tmp_path


def save_reading(cache: Path, image: bytes, body: dict) -> None:
    """A Gemini generateContent answer, cached where the client keeps it (test data, shaped like gemini_sample.json)."""
    path = cache / "gemini" / gemini.screenshot_key(image)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(body)}]}}]}))


def test_without_a_key_a_screen_never_read_says_so(client, no_key):
    r = client.post("/api/import/screenshot", files={"file": ("s.png", FIXTURE.read_bytes(), "image/png")})
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]


def test_without_a_key_a_screen_read_before_is_read_again_and_checked(client, no_key):
    image = FIXTURE.read_bytes()
    save_reading(no_key, image, {"rows": [{"symbol": "bx", "shares": 40, "price": 118.43, "value": 4737.2},
                                          {"symbol": "CASH", "shares": None, "price": None, "value": 250}],
                                 "printed_total": 4987.2})
    r = client.post("/api/import/screenshot", files={"file": ("s.png", image, "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and [row["symbol"] for row in body["rows"]] == ["BX", "CASH"]
    # only that exact image: another one still needs the key
    other = client.post("/api/import/screenshot", files={"file": ("o.png", image + b"\0", "image/png")})
    assert other.status_code == 503


def test_status_says_whether_the_sample_has_a_saved_reading(client, no_key):
    s = client.get("/api/status").json()
    assert s["screenshots"] is False and s["screenshot_sample"] is False
    save_reading(no_key, FIXTURE.read_bytes(), {"rows": [], "printed_total": None})
    assert client.get("/api/status").json()["screenshot_sample"] is True


def test_the_page_offers_the_same_sample_the_server_knows():
    assert PUBLIC.read_bytes() == FIXTURE.read_bytes()
