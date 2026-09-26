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
    etf_weights: {etf: {holding: weight 0..1}}. An ETF's dollars are spread over its holdings."""
    out: dict[str, Exposure] = {}
    for sym, dollars in values.items():
        if sym in etf_weights:
            for holding, w in etf_weights[sym].items():
                out.setdefault(holding, Exposure(holding)).via_etf[sym] = dollars * w
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
