"""Signal engine: has this kind of event mattered for this stock before?

Pure functions, no I/O. For each signal:
  1. find every past event, timestamped by when the public could first know it
  2. enter at the next market open after that moment
  3. measure the return over the signal's horizon (trading days, open -> close)
  4. a "hit" = the stock was lower at the end (every signal here is a risk signal).
     A market-wide event (rate jump) hits every stock on the same days, so there a
     hit = the stock did worse than the market (SPY) over the same days
  5. compare the hit rate to the same stock's hit rate on normal days
     (days whose whole horizon touches no event window), with a 90% Wilson range
  6. label: WEAK if fewer than 10 cases; STRONG only if the range's low end is
     above the normal rate; otherwise NOT PROVEN
A holding is WATCH only when a STRONG signal is firing right now.
Every STRONG result also gets a split-half hold-out (first vs second half of the
history); Pro shows whether it held up in both.
"""

import bisect
import math
from dataclasses import dataclass, field, replace
from datetime import date, datetime, time, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
MARKET_OPEN = time(9, 30)
Z90 = 1.6448536269514722  # two-sided 90%
MIN_CASES = 10

STRONG, WEAK, NOT_PROVEN = "STRONG", "WEAK", "NOT PROVEN"
NO_DATA = "NO DATA"  # the signal's source data isn't loaded for this stock: nothing was tested
CALM, WATCH = "CALM", "WATCH"
HELD_UP, DID_NOT_HOLD, TOO_FEW_TO_CHECK = "held up", "did not hold", "too few cases to check"


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
    vs_market: bool = False  # hit = did worse than the market over the same days, not just lower


INSIDER = Spec("insider_cluster", "Executives sold shares",
               "Insider selling cluster: 3+ Form 4 sales in 10 days", 20)
RATES = Spec("rate_jump", "Interest rates jumped",
             "10-year yield (FRED DGS10) up 0.15 pt or more in a week", 5, vs_market=True)
GAP = Spec("gap_down", "The stock dropped 5% at the open",
           "Gap down: opened 5% or more below the prior close", 20)
SPECS = {s.key: s for s in (INSIDER, RATES, GAP)}
# The same rate jumps, tested on the market itself: was SPY lower afterwards?
MARKET_RATES = Spec("market_rate_jump", "Interest rates jumped: the whole market",
                    "SPY after the 10-year yield (FRED DGS10) rose 0.15 pt or more in a week", 5)
ALL_SPECS = {**SPECS, MARKET_RATES.key: MARKET_RATES}


@dataclass(frozen=True)
class Event:
    known_at: datetime  # tz-aware: when the public could first know
    note: str


@dataclass(frozen=True)
class Case:
    known_at: datetime
    entry_day: date
    exit_day: date
    ret: float  # the stock's own return
    hit: bool
    note: str
    market_ret: float | None = None  # the market's return over the same days, for vs_market signals


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
    holdout: "Holdout | None" = None
    note: str | None = None  # why there is no result, for NO DATA


def no_data(spec: Spec, note: str) -> Result:
    """Not tested because the data isn't there. Never shown as "hasn't happened"."""
    return Result(signal=spec.key, horizon=spec.horizon, n=0, hits=0, hit_rate=None, normal_n=0, normal_hits=0,
                  normal_rate=None, low=None, high=None, label=NO_DATA, firing=None, note=note)


@dataclass(frozen=True)
class Holdout:
    """The same test run separately on each half of the history."""
    first: "Result"
    second: "Result"

    @property
    def verdict(self) -> str:
        """Each half needs MIN_CASES of its own before it can confirm anything."""
        halves = (self.first, self.second)
        if any(h.n < MIN_CASES for h in halves):
            return TOO_FEW_TO_CHECK
        beats = all(h.hit_rate is not None and h.normal_rate is not None and h.hit_rate > h.normal_rate
                    for h in halves)
        return HELD_UP if beats else DID_NOT_HOLD

    @property
    def held_up(self) -> bool:
        return self.verdict == HELD_UP


# ---------- statistics ----------

def wilson(hits: int, n: int, z: float = Z90) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p = hits / n
    d = 1 + z * z / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return max(0.0, (centre - margin) / d), min(1.0, (centre + margin) / d)


def binom_sf(k: int, n: int, p: float) -> float:
    """P(X >= k) for X ~ Binomial(n, p)."""
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k, n + 1))


def p_value(r: "Result") -> float | None:
    """How likely this many hits (or more) would be if the stock just followed its normal rate.
    Only for results that were tested (10+ cases); a screen across many stocks needs this for
    Benjamini-Hochberg. It does not change the STRONG rule."""
    if r.n < MIN_CASES or r.normal_rate is None:
        return None
    return binom_sf(r.hits, r.n, r.normal_rate)


def benjamini_hochberg(pvalues: list[float], q: float = 0.10) -> list[bool]:
    """Which tests survive a false discovery rate of q across all of them."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    passing = [rank for rank, i in enumerate(order, start=1) if pvalues[i] <= rank / m * q]
    cutoff = max(passing, default=0)
    keep = [False] * m
    for rank, i in enumerate(order, start=1):
        keep[i] = rank <= cutoff
    return keep


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

def evaluate(spec: Spec, bars: list[BarLike], events: list[Event],
             market: list[BarLike] | None = None) -> Result:
    """market: the market's daily bars (SPY), required when spec.vs_market."""
    bars = sorted(bars, key=lambda b: b.day)
    mkt: list[BarLike] | None = None
    if spec.vs_market:
        if not market:
            raise ValueError(f"{spec.key} is measured against the market: pass the market's bars")
        by_day = {b.day: b for b in market}
        bars = [b for b in bars if b.day in by_day]  # compare the same days only
        mkt = [by_day[b.day] for b in bars]

    def own(a: int, b: int) -> float:
        return bars[b].close / bars[a].open - 1

    def market_move(a: int, b: int) -> float | None:
        return mkt[b].close / mkt[a].open - 1 if mkt else None

    def hit(a: int, b: int) -> bool:
        m = market_move(a, b)
        return own(a, b) - (m if m is not None else 0.0) < 0

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
            cases.append(Case(ev.known_at, bars[i].day, bars[last].day, own(i, last), hit(i, last), ev.note,
                              market_move(i, last)))
        else:  # the window is still open today
            firing = ev

    in_window = [False] * len(bars)
    for a, b in windows:
        for k in range(a, min(b, len(bars))):
            in_window[k] = True
    # a normal day's whole horizon must be free of event windows, or it measures the event too
    touched = [0]
    for flag in in_window:
        touched.append(touched[-1] + flag)
    normal_n = normal_hits = 0
    for k in range(len(bars) - h + 1):
        if touched[k + h] == touched[k]:
            normal_n += 1
            normal_hits += hit(k, k + h - 1)

    n, hits = len(cases), sum(c.hit for c in cases)
    normal_rate = normal_hits / normal_n if normal_n else None
    low, high = wilson(hits, n) if n else (None, None)
    return Result(
        signal=spec.key, horizon=h, n=n, hits=hits, hit_rate=hits / n if n else None,
        normal_n=normal_n, normal_hits=normal_hits, normal_rate=normal_rate,
        low=low, high=high, label=label_for(n, low if low is not None else 0.0, normal_rate),
        firing=firing, cases=cases,
    )


def holdout(spec: Spec, bars: list[BarLike], events: list[Event],
            market: list[BarLike] | None = None) -> Holdout:
    bars = sorted(bars, key=lambda b: b.day)
    mid = len(bars) // 2
    cut = open_at(bars[mid].day)
    first = evaluate(spec, bars[:mid], [e for e in events if e.known_at < cut], market)
    second = evaluate(spec, bars[mid:], [e for e in events if e.known_at >= cut], market)
    return Holdout(first, second)


def test_signal(spec: Spec, bars: list[BarLike], events: list[Event],
                market: list[BarLike] | None = None) -> Result:
    """evaluate(), plus the split-half hold-out for anything that comes out STRONG."""
    r = evaluate(spec, bars, events, market)
    return replace(r, holdout=holdout(spec, bars, events, market)) if r.label == STRONG else r


def holding_state(results: list[Result]) -> str:
    return WATCH if any(r.firing and r.label == STRONG for r in results) else CALM
