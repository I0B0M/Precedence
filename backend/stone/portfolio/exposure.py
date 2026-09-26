"""What you really own: direct shares plus your slice of each stock inside your ETFs."""

from dataclasses import dataclass, field


@dataclass
class Exposure:
    symbol: str
    direct: float = 0.0
    via_etf: dict[str, float] = field(default_factory=dict)

    @property
    def total(self) -> float:
        return self.direct + sum(self.via_etf.values())


def exposures(values: dict[str, float], etf_weights: dict[str, dict[str, float]]) -> dict[str, Exposure]:
    """values: dollars held directly per symbol (ETFs included).
    etf_weights: {etf: {holding: weight 0..1}}. An ETF's dollars are spread over its holdings;
    whatever part of the fund we have no holdings for stays as the fund itself, so the
    exposures always add up to what you hold."""
    out: dict[str, Exposure] = {}
    for sym, dollars in values.items():
        if sym in etf_weights:
            for holding, w in etf_weights[sym].items():
                out.setdefault(holding, Exposure(holding)).via_etf[sym] = dollars * w
            rest = dollars * (1 - sum(etf_weights[sym].values()))
            if rest > 0.005:  # more than half a cent left over
                out.setdefault(sym, Exposure(sym)).direct += rest
        else:
            out.setdefault(sym, Exposure(sym)).direct += dollars
    return out


def bad_day_return(closes: list[float], days: int = 252, pct: float = 0.05) -> float | None:
    """The 1-in-20 worst daily move over the past year (a negative number), close to close."""
    closes = closes[-(days + 1):]
    if len(closes) < 21:
        return None
    rets = sorted(b / a - 1 for a, b in zip(closes, closes[1:]))
    return rets[int(len(rets) * pct)]


# A stock you hold only through funds gets its own row on the board only at 1%+ of everything
# you own; smaller slices stay inside their fund (as its children) and don't count as "worth a look".
OWN_ROW_MIN_SHARE = 0.01


@dataclass
class BoardRow:
    symbol: str
    direct: float  # dollars you hold directly (for a fund: the whole fund)
    via_etf: dict[str, float]  # dollars inside your funds (stocks only)
    shown: float  # dollars this row stands for on the board; the rows add up to your total
    children: dict[str, float] = field(default_factory=dict)  # fund rows: small slices kept inside


def board_rows(values: dict[str, float], etf_weights: dict[str, dict[str, float]]) -> dict[str, BoardRow]:
    total = sum(values.values())
    rows: dict[str, BoardRow] = {}
    for sym, e in exposures(values, etf_weights).items():
        if sym in etf_weights:  # the part of a fund no stock row takes
            rows.setdefault(sym, BoardRow(sym, values[sym], {}, 0.0)).shown += e.total
        elif e.direct > 0 or (total and e.total / total >= OWN_ROW_MIN_SHARE):
            rows[sym] = BoardRow(sym, e.direct, dict(e.via_etf), e.total)
        else:
            for fund, dollars in e.via_etf.items():
                row = rows.setdefault(fund, BoardRow(fund, values[fund], {}, 0.0))
                row.children[sym] = dollars
                row.shown += dollars
    for fund in etf_weights:  # a fully looked-through fund with no leftover still needs its row
        if fund in values and fund not in rows:
            rows[fund] = BoardRow(fund, values[fund], {}, 0.0)
    return rows
