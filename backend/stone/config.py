"""Settings read from backend/.env. Missing keys are fine until a source is connected."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    sec_user_agent: str
    alpaca_api_key: str
    alpaca_api_secret: str
    fred_api_key: str
    gemini_api_key: str
    cache_dir: Path


def load() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL", "postgresql://localhost:5432/stone"),
        sec_user_agent=os.getenv("SEC_USER_AGENT", ""),
        alpaca_api_key=os.getenv("ALPACA_API_KEY", ""),
        alpaca_api_secret=os.getenv("ALPACA_API_SECRET", ""),
        fred_api_key=os.getenv("FRED_API_KEY", ""),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        cache_dir=Path(os.getenv("STONE_CACHE_DIR", REPO_DIR / "data" / "cache")),
    )


def readers_on() -> bool:
    """Whether the Readers' signals (stone.readers) run next to the built-in three. Off by default."""
    return os.getenv("STONE_READERS", "0") == "1"


class NotConnected(RuntimeError):
    """Raised when a source is called before its key is set."""
