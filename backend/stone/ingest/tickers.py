"""The real tickers Stone loads.

CORE: 20 stocks with hand-entered CIKs (checked against SEC on every real run) and
full Form 4 insider history. SP100: the rest of the S&P 100, CIK and name looked up
from SEC's company_tickers.json at run time; filings, XBRL and prices, no Form 4s.
The S&P 100 list is from memory (2025 membership) and may be slightly out of date."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Ticker:
    symbol: str
    cik: int | None
    name: str
    sector: str | None
    kind: str = "stock"
    form4: bool = True
    sec_symbol: str | None = None  # SEC writes BRK-B where exchanges write BRK.B
    also_ciks: tuple[int, ...] = ()  # older/newer registrants for the same stock


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
    # 2026: XOM moved to a new holding company (CIK 2115436); the 2-year history is under 34088.
    Ticker("XOM", 34088, "Exxon Mobil", "Energy", also_ciks=(2115436,)),
    Ticker("CVX", 93410, "Chevron", "Energy"),
    Ticker("JNJ", 200406, "Johnson & Johnson", "Healthcare"),
    Ticker("PFE", 78003, "Pfizer", "Healthcare"),
    # Prices only: ETFs have no XBRL financials.
    Ticker("SPY", None, "SPDR S&P 500 ETF", "Index", kind="etf"),
    Ticker("QQQ", None, "Invesco QQQ", "Index", kind="etf"),
    # Other S&P 500 ETFs: their own prices, SPY's holdings (see HOLDINGS_FROM).
    Ticker("VOO", None, "Vanguard S&P 500 ETF", "Index", kind="etf"),
    Ticker("IVV", None, "iShares Core S&P 500 ETF", "Index", kind="etf"),
    Ticker("SPYM", None, "State Street SPDR Portfolio S&P 500 ETF", "Index", kind="etf"),
]

# ETFs that track the same index as another fund whose holdings we load: use that fund's holdings.
HOLDINGS_FROM = {"VOO": "SPY", "IVV": "SPY", "SPYM": "SPY"}

# Old tickers that statements may still print. SPLG became SPYM on 2025-10-31 (same fund and holdings).
RENAMED = {"SPLG": "SPYM"}

SP100_EXTRA = """ABBV ABT ACN ADBE AIG AMGN AMT AVGO AXP BA BNY BKNG BLK BMY C CAT CHTR CL CMCSA COF COP COST
CRM CSCO CVS DE DHR DUK EMR F FDX GD GE GILD GM GS HD HON IBM INTU ISRG LIN LLY LMT LOW MA MCD MDLZ MDT
MET MMM MO MRK MS NEE NKE NOW ORCL PEP PG PLTR PM PYPL QCOM RTX SBUX SCHW SO SPG T TGT TMO TMUS TXN UBER
UNH UNP UPS USB V VZ WFC""".split()

TICKERS += [Ticker(sym, None, sym, None, form4=False) for sym in SP100_EXTRA]
TICKERS.append(Ticker("BRK.B", None, "BRK.B", None, form4=False, sec_symbol="BRK-B"))

STOCKS = [t for t in TICKERS if t.kind == "stock"]
