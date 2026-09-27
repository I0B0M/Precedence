"""How bumpy a portfolio has been: volatility, worst drop from a high, beta vs the market, worst day, Sharpe.

The numbers come from QuantStats (github.com/ranaroussi/quantstats) run on Stone's own daily closes.
The portfolio is today's mix held fixed over the whole history: each day's return is the
value-weighted average of its holdings' returns, using today's weights. Price only, no dividends."""

from dataclasses import dataclass
from datetime import date

import pandas as pd
import quantstats as qs

BASIS = "today's mix held fixed over every day shown, daily closes, price only (no dividends), Sharpe with a 0% risk-free rate"
MIN_DAYS = 60  # fewer than this and the numbers say more about luck than about the mix


@dataclass(frozen=True)
class Risk:
    volatility: float  # annualised standard deviation of daily returns
    max_drawdown: float  # worst fall from a high, negative (e.g. -0.18)
    drawdown_start: date  # the high before the worst fall
    drawdown_bottom: date
    beta: float | None  # vs the market; None for the market itself
    sharpe: float
    worst_day: float  # the worst single daily return, negative
    worst_day_on: date
    total_return: float  # first day shown to last


def daily_returns(closes: dict[str, list[tuple[date, float]]], weights: dict[str, float]) -> pd.Series:
    """Today's weights times each holding's daily return, on the days every holding has a close."""
    frame = pd.DataFrame({s: pd.Series(dict(closes[s])) for s in weights}).dropna()
    frame.index = pd.to_datetime(frame.index)
    rets = frame.sort_index().pct_change().dropna()
    return (rets * pd.Series(weights)).sum(axis=1)


def measure(returns: pd.Series, market: pd.Series | None) -> Risk:
    wealth = (1 + returns).cumprod()
    drawdown = wealth / wealth.cummax() - 1
    bottom = drawdown.idxmin()
    start = wealth[:bottom].idxmax()
    beta = None
    if market is not None:
        both = pd.concat([returns, market], axis=1, join="inner").dropna()
        beta = float(qs.stats.greeks(both.iloc[:, 0], both.iloc[:, 1])["beta"])
    return Risk(
        volatility=float(qs.stats.volatility(returns, periods=252)),
        max_drawdown=float(qs.stats.max_drawdown(wealth)),
        drawdown_start=start.date(),
        drawdown_bottom=bottom.date(),
        beta=beta,
        sharpe=float(qs.stats.sharpe(returns, rf=0.0, periods=252)),
        worst_day=float(qs.stats.worst(returns)),
        worst_day_on=returns.idxmin().date(),
        total_return=float(wealth.iloc[-1] - 1),
    )


def portfolio_risk(closes: dict[str, list[tuple[date, float]]], values: dict[str, float],
                   market_symbol: str) -> tuple[Risk, Risk, pd.Series] | None:
    """(the portfolio, the market, the portfolio's daily returns), or None with too little shared history."""
    priced = {s: v for s, v in values.items() if closes.get(s)}
    total = sum(priced.values())
    if not total or market_symbol not in closes:
        return None
    weights = {s: v / total for s, v in priced.items()}
    mine = daily_returns(closes, weights)
    market = daily_returns(closes, {market_symbol: 1.0})
    if len(mine) < MIN_DAYS:
        return None
    return measure(mine, market), measure(market.loc[mine.index.min():], None), mine
