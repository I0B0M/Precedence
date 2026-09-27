"""The investor's holdings priced at the last close, and the key a portfolio is saved under. The board,
the risk card and the briefing all start here, so a ticker a statement still prints under its old name
(SPLG, now SPYM) is worth the same in each."""

from collections.abc import Container, Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import NamedTuple

import psycopg

from stone.ingest.tickers import RENAMED


class Holding(NamedTuple):
    symbol: str  # as typed: any case, maybe an old ticker
    shares: float


def last_two_closes(c: psycopg.Connection, ticker: str) -> tuple[dict | None, float | None]:
    """The latest bar (day, close) and its change on the close before; (None, None) without prices."""
    rows = c.execute("select day, close from prices_daily where ticker = %s order by day desc limit 2",
                     (ticker,)).fetchall()
    if not rows:
        return None, None
    change = float(rows[0]["close"]) / float(rows[1]["close"]) - 1 if len(rows) == 2 else None
    return rows[0], change


@dataclass(frozen=True)
class PricedHolding:
    symbol: str  # the current ticker
    typed: str  # as sent, upper case
    shares: float
    price: float  # the last close
    value: float
    change: float | None  # the last close against the one before, a fraction
    day: date  # the day of that close

    @property
    def renamed_from(self) -> str | None:
        return self.typed if self.typed != self.symbol else None


@dataclass(frozen=True)
class Priced:
    holdings: list[PricedHolding]  # in the order sent
    unknown: list[str]  # as typed, upper case: no company or no price for it

    @property
    def values(self) -> dict[str, float]:
        """Dollars by current symbol; a symbol sent twice is summed. A new dict each time."""
        out: dict[str, float] = {}
        for h in self.holdings:
            out[h.symbol] = out.get(h.symbol, 0.0) + h.value
        return out

    @property
    def total(self) -> float:
        return sum(h.value for h in self.holdings)

    @property
    def price_as_of(self) -> date | None:
        """The latest close any holding is priced at."""
        return max((h.day for h in self.holdings), default=None)


def price_holdings(c: psycopg.Connection, holdings: Iterable[Holding], known: Container[str]) -> Priced:
    """Each holding at its last close, under its current ticker. known: the tickers in the companies table."""
    priced, unknown = [], []
    for symbol, shares in holdings:
        typed = _as_typed(symbol)
        sym = RENAMED.get(typed, typed)
        last, change = last_two_closes(c, sym) if sym in known else (None, None)
        if not last:
            unknown.append(typed)
            continue
        close = float(last["close"])
        priced.append(PricedHolding(sym, typed, shares, close, shares * close, change, last["day"]))
    return Priced(priced, unknown)


def holdings_key(holdings: Iterable[Holding]) -> str:
    """The Portfolio key: each holding as typed, upper case, sorted by symbol, 'SYMBOL-shares' joined by '_',
    shares as JavaScript writes a number. Same as savedKey() in frontend/src/lib/api.ts."""
    pairs = sorted(((_as_typed(s), n) for s, n in holdings), key=lambda p: p[0])
    return "_".join(f"{s}-{_js_number(n)}" for s, n in pairs)


def _as_typed(symbol: str) -> str:
    return symbol.strip().upper()


def _js_number(x: float) -> str:
    """JavaScript's String(x) for a finite number: every digit (3.1415926, not :g's 3.14159), no trailing .0,
    plain decimals from 1e-6 up to 1e21 and exponents outside that (1e-7, 1e+21)."""
    x = float(x)
    if x == 0:
        return "0"
    if x < 0:
        return "-" + _js_number(-x)
    t = Decimal(repr(x)).normalize().as_tuple()  # repr is the shortest round-trip form, as in JavaScript
    digits, k = "".join(map(str, t.digits)), len(t.digits)
    n = t.exponent + k  # x = 0.<digits> * 10**n
    if k <= n <= 21:
        return digits + "0" * (n - k)
    if 0 < n <= 21:
        return f"{digits[:n]}.{digits[n:]}"
    if -6 < n <= 0:
        return f"0.{'0' * -n}{digits}"
    e = n - 1
    return f"{digits[0]}{'.' + digits[1:] if k > 1 else ''}e{'+' if e > 0 else '-'}{abs(e)}"
