"""Is a screenshot read correct? The rows must add up to the total printed on screen.

Two checks, both from numbers on the screenshot itself:
  1. each row: shares x price should equal the row's value
  2. the rows' values should add up to the printed total
When the total agrees, the value column is trusted and a row that fails check 1
had its shares misread: we suggest shares = value / price.
When the total disagrees, we try each failing row's shares x price instead of its
value, and suggest the fix only if it makes the total add up.
"""

from dataclasses import dataclass, field

OK, FIXABLE, NEEDS_REVIEW, NO_TOTAL = "ok", "fixable", "needs_review", "no_total"


@dataclass(frozen=True)
class Row:
    symbol: str
    shares: float | None
    price: float | None
    value: float | None


@dataclass
class RowCheck:
    symbol: str
    ok: bool
    problem: str | None = None
    fix: dict[str, float] = field(default_factory=dict)


@dataclass
class Reconciled:
    status: str
    rows_sum: float
    printed_total: float | None
    difference: float | None
    rows: list[RowCheck]
    message: str


def close_enough(a: float, b: float) -> bool:
    """Screens round shares and prices, so allow half a percent or 5 cents."""
    return abs(a - b) <= max(0.05, 0.005 * abs(b))


def total_matches(rows_sum: float, total: float) -> bool:
    """Totals are printed to the cent; allow a dollar for rounding across rows."""
    return abs(rows_sum - total) <= 1.0


def reconcile(rows: list[Row], printed_total: float | None) -> Reconciled:
    checks = []
    for r in rows:
        if r.shares is not None and r.price is not None and r.value is not None:
            good = close_enough(r.shares * r.price, r.value)
            checks.append(RowCheck(r.symbol, good, None if good else
                                   f"{r.shares:g} shares x ${r.price:,.2f} is ${r.shares * r.price:,.2f}, "
                                   f"but the row says ${r.value:,.2f}"))
        else:
            checks.append(RowCheck(r.symbol, r.value is not None, None if r.value is not None else "no value read"))

    rows_sum = sum(r.value or 0.0 for r in rows)
    if printed_total is None:
        return Reconciled(NO_TOTAL, rows_sum, None, None, checks,
                          "No total on the screenshot, so the rows can't be checked. Please confirm them.")

    diff = round(printed_total - rows_sum, 2)
    bad = [i for i, c in enumerate(checks) if not c.ok]

    if total_matches(rows_sum, printed_total):
        for i in bad:
            r = rows[i]
            if r.price and r.value is not None:
                checks[i].fix = {"shares": round(r.value / r.price, 4)}
        if not bad:
            return Reconciled(OK, rows_sum, printed_total, diff, checks,
                              f"Adds up to ${printed_total:,.2f}, the same total the screen shows.")
        fixed_all = all(checks[i].fix for i in bad)
        return Reconciled(FIXABLE if fixed_all else NEEDS_REVIEW, rows_sum, printed_total, diff, checks,
                          "The total checks out, but some share counts were misread."
                          + (" We corrected them from value / price." if fixed_all else " Please fix them."))

    for i in bad:
        r = rows[i]
        if r.shares is not None and r.price is not None:
            candidate = rows_sum - (r.value or 0.0) + r.shares * r.price
            if total_matches(candidate, printed_total):
                checks[i].fix = {"value": round(r.shares * r.price, 2)}
                return Reconciled(FIXABLE, rows_sum, printed_total, diff, checks,
                                  f"The rows didn't add up to ${printed_total:,.2f}. One value was misread, "
                                  f"and fixing {r.symbol} makes it add up.")
    return Reconciled(NEEDS_REVIEW, rows_sum, printed_total, diff, checks,
                      f"The rows add up to ${rows_sum:,.2f} but the screen says ${printed_total:,.2f} "
                      f"(off by ${abs(diff):,.2f}). A row may be misread or missing.")
