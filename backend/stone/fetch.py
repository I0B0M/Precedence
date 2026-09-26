"""One door for every outside HTTP call: rate-limited, and cached to disk first.

A response is saved under data/cache/<source>/<key> before anything parses it,
so a re-run with no internet rebuilds the database from disk. The demo never
depends on a live API.
"""

import hashlib
import threading
import time
from pathlib import Path

import httpx


class RateLimiter:
    """Allows at most `per_second` calls per second across threads."""

    def __init__(self, per_second: float):
        self.interval = 1.0 / per_second
        self._next = 0.0
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            if now < self._next:
                time.sleep(self._next - now)
                now = self._next
            self._next = now + self.interval


class CachedFetcher:
    def __init__(self, source: str, cache_dir: Path, limiter: RateLimiter,
                 headers: dict[str, str] | None = None, offline: bool = False):
        self.dir = cache_dir / source
        self.limiter = limiter
        self.headers = headers or {}
        self.offline = offline

    def path_for(self, key: str) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
        if len(safe) > 120:
            safe = safe[:80] + "_" + hashlib.sha1(key.encode()).hexdigest()[:16]
        return self.dir / safe

    def get(self, url: str, key: str, params: dict | None = None) -> bytes:
        path = self.path_for(key)
        if path.exists():
            return path.read_bytes()
        if self.offline:
            raise FileNotFoundError(f"offline and not cached: {path}")
        self.limiter.wait()
        resp = httpx.get(url, params=params, headers=self.headers, timeout=30,
                         follow_redirects=True)
        resp.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(resp.content)
        return resp.content
