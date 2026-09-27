"""How often does the engine call a signal STRONG when the news changes nothing? (docs/v2-plan.md,
the calibration number.) Simulated stocks with no reaction to their events; a fair one-sided 95%
test should say STRONG about 5% of the time:

  1. company events (insider cluster, gap down, or a Reader's "bad news" style): random dates
  2. a market-wide event (rate-jump style): the same 15 dates for every stock, after which the
     market tends to fall, judged against the market (so a high-beta stock isn't a false hit)

    uv run python scripts/calibration_check.py           # 1,000 stocks per row, about 30 seconds
    uv run python scripts/calibration_check.py --quick   # 200 per row
"""

import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from stone.signals import engine as e


@dataclass(frozen=True)
class Bar:
    day: date
    open: float
    close: float


def weekdays(start: date, n: int) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


DAYS = weekdays(date(2024, 9, 2), 504)  # about two years, like the real data


def bars_from(rets: list[float]) -> list[Bar]:
    out, px = [], 100.0
    for d, r in zip(DAYS, rets):
        out.append(Bar(d, px, px * (1 + r)))
        px *= 1 + r
    return out


def event_after(i: int) -> e.Event:
    return e.Event(datetime.combine(DAYS[i], time(17), tzinfo=e.EASTERN), str(i))


def company_events(spec: e.Spec, trials: int, n_events: int, rng: random.Random) -> float:
    strong = 0
    for _ in range(trials):
        bars = bars_from([rng.gauss(0.0004, 0.018) for _ in DAYS])
        days = sorted(rng.sample(range(5, len(DAYS) - spec.horizon - 2), n_events))
        strong += e.test_signal(spec, bars, [event_after(i) for i in days]).label == e.STRONG
    return strong / trials


def market_wide(trials: int, betas: tuple[float, ...], rng: random.Random) -> dict[float, float]:
    strong = {b: 0 for b in betas}
    for _ in range(trials):
        dates = sorted(rng.sample(range(10, len(DAYS) - 8, 7), 15))
        drift = [0.0004] * len(DAYS)
        for i in dates:  # the market falls about 1.5% over the week after each event
            for k in range(i + 1, i + 6):
                drift[k] = -0.003
        mret = [rng.gauss(drift[k], 0.009) for k in range(len(DAYS))]
        market = bars_from(mret)
        for b in betas:
            stock = bars_from([b * m + rng.gauss(0.0, 0.013) for m in mret])
            strong[b] += e.test_signal(e.RATES, stock, [event_after(i) for i in dates], market).label == e.STRONG
    return {b: n / trials for b, n in strong.items()}


def main() -> int:
    quick = "--quick" in sys.argv
    trials = 200 if quick else 1000
    rng = random.Random(7)
    print(f"{trials} simulated stocks per row; a fair test says STRONG about 5% of the time\n")
    print("company events (no effect)        cases  STRONG")
    for spec, n in ((e.INSIDER, 12), (e.INSIDER, 30), (e.GAP, 15), (e.NEWS, 12), (e.NEWS, 40)):
        print(f"  {spec.key:<18} horizon {spec.horizon:>2}   {n:>5}  {company_events(spec, trials, n, rng):6.1%}")
    print("\nmarket-wide event, judged against the market   beta  STRONG")
    for b, rate in market_wide(trials, (0.6, 1.0, 1.8), rng).items():
        print(f"  {e.RATES.key:<18} horizon {e.RATES.horizon:>2}          {b:>4}  {rate:6.1%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
