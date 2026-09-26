"""The real tickers Stone loads. CIKs are checked against SEC's company_tickers.json
on every real ingest run (ingest.pipeline.check_ciks), so a typo here fails loudly."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Ticker:
    symbol: str
    cik: int | None
    name: str
    sector: str
    kind: str = "stock"


TICKERS: list[Ticker] = [
    Ticker("AAPL", 320193, "Apple", "Technology"),
    Ticker("MSFT", 789019, "Microsoft", "Technology"),
    Ticker("NVDA", 1045810, "NVIDIA", "Semiconductors"),
    Ticker("AMD", 2488, "Advanced Micro Devices", "Semiconductors"),
    Ticker("INTC", 50863, "Intel", "Semiconductors"),
    Ticker("AMZN", 1018724, "Amazon", "Consumer"),
    Ticker("GOOGL", 1652044, "Alphabet", "Communication"),
    Ticker("META", 1326801, "Meta Platforms", "Communication"),
    Ticker("NFLX", 1065280, "Netflix", "Communication"),
    Ticker("DIS", 1744489, "Walt Disney", "Communication"),
    Ticker("TSLA", 1318605, "Tesla", "Consumer"),
    Ticker("WMT", 104169, "Walmart", "Consumer"),
    Ticker("KO", 21344, "Coca-Cola", "Consumer"),
    Ticker("JPM", 19617, "JPMorgan Chase", "Banks"),
    Ticker("BAC", 70858, "Bank of America", "Banks"),
    Ticker("BX", 1393818, "Blackstone", "Asset Management"),
    Ticker("XOM", 34088, "Exxon Mobil", "Energy"),
    Ticker("CVX", 93410, "Chevron", "Energy"),
    Ticker("JNJ", 200406, "Johnson & Johnson", "Healthcare"),
    Ticker("PFE", 78003, "Pfizer", "Healthcare"),
    # Prices only: ETFs have no XBRL financials.
    Ticker("SPY", None, "SPDR S&P 500 ETF", "Index", kind="etf"),
    Ticker("QQQ", None, "Invesco QQQ", "Index", kind="etf"),
]

STOCKS = [t for t in TICKERS if t.kind == "stock"]
