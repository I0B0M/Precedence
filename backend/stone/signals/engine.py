"""Signal engine: has this kind of event mattered for this stock before?

Pure functions, no I/O. For each signal:
  1. find every past event, timestamped by when the public could first know it
  2. enter at the next market open after that moment
  3. measure the return over the signal's horizon (trading days, open -> close)
  4. a "hit" = the stock was lower at the end (every signal here is a risk signal)
  5. compare the hit rate to the same stock's hit rate on normal days
     (every day not inside an event window), with a 90% Wilson range
  6. label: WEAK if fewer than 10 cases; STRONG only if the range's low end is
     above the normal rate; otherwise NOT PROVEN
A holding is WATCH only when a STRONG signal is firing right now.
"""

import bisect
import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
MARKET_OPEN = time(9, 30)
Z90 = 1.6448536269514722  # two-sided 90%
MIN_CASES = 10

STRONG, WEAK, NOT_PROVEN = "STRONG", "WEAK", "NOT PROVEN"
CALM, WATCH = "CALM", "WATCH"


class BarLike(Protocol):
    day: date
    open: float
    close: float


@dataclass(frozen=True)
class Spec:
    key: str
    lite: str
    pro: str
    horizon: int  # trading days


INSIDER = Spec("insider_cluster", "Executives sold shares",
               "Insider selling cluster: 3+ Form 4 sales in 10 days", 20)
RATES = Spec("rate_jump", "Interest rates jumped",
             "10-year yield (FRED DGS10) up 0.15 pt or more in a week", 5)
GAP = Spec("gap_down", "The stock dropped 5% at the open",
           "Gap down: opened 5% or more below the prior close", 20)
SPECS = {s.key: s for s in (INSIDER, RATES, GAP)}


@dataclass(frozen=True)
class Event:
    known_at: datetime  # tz-aware: when the public could first know
    note: str


@dataclass(frozen=True)
class Case:
    known_at: datetime
    entry_day: date
    exit_day: date
    ret: float
    hit: bool
    note: str


@dataclass(frozen=True)
class Result:
    signal: str
    horizon: int
    n: int
    hits: int
    hit_rate: float | None
    normal_n: int
    normal_hits: int
    normal_rate: float | None
    low: float | None
    high: float | None
    label: str
    firing: Event | None
    cases: list[Case] = field(default_factory=list)


# ---------- statistics ----------

def wilson(hits: int, n: int, z: float = Z90) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p = hits / n
    d = 1 + z * z / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return max(0.0, (centre - margin) / d), min(1.0, (centre + margin) / d)


def label_for(n: int, low: float, normal_rate: float | None) -> str:
    if n < MIN_CASES:
        return WEAK
    if normal_rate is not None and low > normal_rate:
        return STRONG
    return NOT_PROVEN


# ---------- timing ----------

def open_at(day: date) -> datetime:
    return datetime.combine(day, MARKET_OPEN, tzinfo=EASTERN)


def entry_index(bars: list[BarLike], known_at: datetime) -> int | None:
    """First bar whose open is strictly after the event became known."""
    opens = [open_at(b.day) for b in bars]
    i = bisect.bisect_right(opens, known_at)
    return i if i < len(bars) else None


def next_weekday(d: date) -> date:
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def rate_known_at(obs_day: date) -> datetime:
    """The Fed's H.15 publishes a day's yields the next business day, afternoon ET.
    We treat a DGS10 value as known at 16:15 ET the next weekday (conservative)."""
    return datetime.combine(next_weekday(obs_day), time(16, 15), tzinfo=EASTERN)


# ---------- detectors ----------

def detect_gap_downs(bars: list[BarLike], threshold: float = 0.05) -> list[Event]:
    out = []
    for prev, cur in zip(bars, bars[1:]):
        drop = round(cur.open / prev.close - 1, 6)  # so an exact 5% gap is 5%, not 5.0000000000000044%
        if drop <= -threshold:
            out.append(Event(open_at(cur.day), f"{cur.day}: opened {abs(drop) * 100:.1f}% below the prior close"))
    return out


def detect_rate_jumps(obs: list[tuple[date, float]], jump: float = 0.15, days: int = 7) -> list[Event]:
    obs = sorted(obs)
    days_list = [d for d, _ in obs]
    out = []
    for d, v in obs:
        j = bisect.bisect_right(days_list, d - timedelta(days=days)) - 1
        if j < 0:
            continue
        change = round(v - obs[j][1], 4)
        if change >= jump:
            out.append(Event(rate_known_at(d), f"{d}: 10-year yield {v:.2f}%, up {change:.2f} pt in a week"))
    return out


def detect_insider_clusters(sales: list[tuple[str, datetime]], min_filings: int = 3,
                            window_days: int = 10) -> list[Event]:
    """sales: (accession, accepted_at) of Form 4 filings with at least one open-market sale.
    Fires at the filing that makes it 3 distinct filings inside 10 days."""
    seen: dict[str, datetime] = {}
    for acc, at in sales:
        seen[acc] = min(at, seen.get(acc, at))
    filings = sorted(seen.values())
    out = []
    for j, at in enumerate(filings):
        start = at - timedelta(days=window_days)
        count = sum(1 for t in filings[: j + 1] if t > start)
        if count >= min_filings:
            out.append(Event(at, f"{at.date()}: {count} insider sale filings in {window_days} days"))
    return out


# ---------- evaluation ----------

def evaluate(spec: Spec, bars: list[BarLike], events: list[Event]) -> Result:
    bars = sorted(bars, key=lambda b: b.day)
    h = spec.horizon
    cases: list[Case] = []
    windows: list[tuple[int, int]] = []
    firing: Event | None = None
    busy_until = -1  # next case may not start inside the previous case's window

    for ev in sorted(events, key=lambda e: e.known_at):
        i = entry_index(bars, ev.known_at)
        if i is None:  # known after the last bar we have: firing, nothing to measure yet
            firing = ev
            continue
        if i < busy_until:  # overlaps the previous case: not a new case, but may still be live
            if i + h - 1 >= len(bars):
                firing = ev
            continue
        busy_until = i + h
        windows.append((i, i + h))
        last = i + h - 1
        if last < len(bars):
            ret = bars[last].close / bars[i].open - 1
            cases.append(Case(ev.known_at, bars[i].day, bars[last].day, ret, ret < 0, ev.note))
        else:  # the window is still open today
            firing = ev

    in_window = [False] * len(bars)
    for a, b in windows:
        for k in range(a, min(b, len(bars))):
            in_window[k] = True
    normal_n = normal_hits = 0
    for k in range(len(bars) - h + 1):
        if not in_window[k]:
            normal_n += 1
            normal_hits += bars[k + h - 1].close / bars[k].open - 1 < 0

    n, hits = len(cases), sum(c.hit for c in cases)
    normal_rate = normal_hits / normal_n if normal_n else None
    low, high = wilson(hits, n) if n else (None, None)
    return Result(
        signal=spec.key, horizon=h, n=n, hits=hits, hit_rate=hits / n if n else None,
        normal_n=normal_n, normal_hits=normal_hits, normal_rate=normal_rate,
        low=low, high=high, label=label_for(n, low if low is not None else 0.0, normal_rate),
        firing=firing, cases=cases,
    )


def holding_state(results: list[Result]) -> str:
    return WATCH if any(r.firing and r.label == STRONG for r in results) else CALM
