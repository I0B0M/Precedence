"""401(k) / IRA funds: which ones behave like something Precedence can test.

Only S&P 500 index funds are an "exact index" match for SPY. Total-US-market funds hold the S&P
500 plus smaller companies, so they're a "close stand-in", labelled that way. Target-date, bond and
international funds are not mapped and get no state. Each benchmark comes from the fund's own
page or prospectus; `source` says where it was checked.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Fund:
    ticker: str
    name: str
    category: str
    benchmark: str
    behaves_like: str | None
    match: str | None  # "exact index" | "close stand-in" | None
    source: str | None  # where the benchmark was checked


SP500, TOTAL_US = "S&P 500 index", "US total market index"
NOTES = {
    "Target date": "A mix of stocks and bonds that shifts over time; not tested.",
    "Bond": "Bonds, not stocks; not tested.",
    "International": "Stocks outside the US; not tested.",
    "US mid-cap index": "Mid-size US companies, mostly outside the S&P 500; not tested.",
}

# Each benchmark was read from the fund's summary prospectus (SEC form 497K, Oct 2025 - Jun 2026): the
# investment strategy and the performance table. `source` is that filing.
_EDGAR = "https://www.sec.gov/Archives/edgar/data/"
FUNDS: dict[str, Fund] = {f.ticker: f for f in (
    Fund("FXAIX", "Fidelity 500 Index Fund", SP500, "S&P 500 Index", "SPY", "exact index",
         _EDGAR + "819118/000081911826000073/filing11574.htm"),
    Fund("VFIAX", "Vanguard 500 Index Fund Admiral Shares", SP500, "S&P 500 Index", "SPY", "exact index",
         _EDGAR + "36405/000003640526000182/f44771d1.htm"),
    Fund("VFINX", "Vanguard 500 Index Fund Investor Shares", SP500, "S&P 500 Index", "SPY", "exact index",
         _EDGAR + "36405/000003640526000185/f44770d1.htm"),
    Fund("SWPPX", "Schwab S&P 500 Index Fund", SP500, "S&P 500 Index", "SPY", "exact index",
         _EDGAR + "904333/000088454626000052/c497k.htm"),
    Fund("FSKAX", "Fidelity Total Market Index Fund", TOTAL_US, "Dow Jones U.S. Total Stock Market Index", "SPY",
         "close stand-in", _EDGAR + "819118/000081911826000078/filing11574.htm"),
    Fund("VTSAX", "Vanguard Total Stock Market Index Fund Admiral Shares", TOTAL_US, "CRSP US Total Market Index",
         "SPY", "close stand-in", _EDGAR + "36405/000003640526000214/f44873d1.htm"),
    Fund("SWTSX", "Schwab Total Stock Market Index Fund", TOTAL_US, "Dow Jones U.S. Total Stock Market Index", "SPY",
         "close stand-in", _EDGAR + "904333/000088454626000053/c497k.htm"),
    Fund("VFIFX", "Vanguard Target Retirement 2050 Fund Investor Shares", "Target date",
         "Target Retirement 2050 Composite Index", None, None, _EDGAR + "752177/000119312526025006/f43867d1.htm"),
    Fund("VFFVX", "Vanguard Target Retirement 2055 Fund Investor Shares", "Target date",
         "Target Retirement 2055 Composite Index", None, None, _EDGAR + "752177/000119312526024999/f43866d1.htm"),
    Fund("VTTSX", "Vanguard Target Retirement 2060 Fund Investor Shares", "Target date",
         "Target Retirement 2060 Composite Index", None, None, _EDGAR + "752177/000119312526025009/f43865d1.htm"),
    Fund("FFFHX", "Fidelity Freedom 2050 Fund", "Target date", "Fidelity Freedom 2050 Composite Index", None, None,
         _EDGAR + "880195/000088019526000415/filing12324.htm"),
    Fund("FDEWX", "Fidelity Freedom Index 2055 Fund Investor Class", "Target date",
         "Fidelity Freedom Index 2055 Composite Index", None, None, _EDGAR + "880195/000088019526000444/filing12325.htm"),
    Fund("FDKLX", "Fidelity Freedom Index 2060 Fund Investor Class", "Target date",
         "Fidelity Freedom Index 2060 Composite Index", None, None, _EDGAR + "880195/000088019526000445/filing12325.htm"),
    Fund("VBTLX", "Vanguard Total Bond Market Index Fund Admiral Shares", "Bond",
         "Bloomberg U.S. Aggregate Float Adjusted Index", None, None, _EDGAR + "794105/000079410526000113/f44825d1.htm"),
    Fund("FXNAX", "Fidelity U.S. Bond Index Fund", "Bond", "Bloomberg U.S. Aggregate Bond Index", None, None,
         _EDGAR + "35315/000003531525001095/filing9919.htm"),
    Fund("VTIAX", "Vanguard Total International Stock Index Fund Admiral Shares", "International",
         "FTSE Global All Cap ex US Index", None, None, _EDGAR + "736054/000119312526077508/f44037d1.htm"),
    Fund("FTIHX", "Fidelity Total International Index Fund", "International",
         "MSCI ACWI ex USA Investable Market Index", None, None, _EDGAR + "35315/000003531525001314/filing10370.htm"),
    Fund("FSMDX", "Fidelity Mid Cap Index Fund", "US mid-cap index", "Russell Midcap Index", None, None,
         _EDGAR + "35315/000003531526000394/filing12077.htm"),
    Fund("VIMAX", "Vanguard Mid-Cap Index Fund Admiral Shares", "US mid-cap index", "CRSP US Mid Cap Index", None,
         None, _EDGAR + "36405/000003640526000225/f44889d1.htm"),
)}


def _norm(s: str) -> str:
    return " ".join(s.lower().replace("®", "").split())


def find(query: str) -> Fund | None:
    q = query.strip().upper()
    if q in FUNDS:
        return FUNDS[q]
    n = _norm(query)
    return next((f for f in FUNDS.values() if n and (n == _norm(f.name) or n in _norm(f.name))), None)


def lookup(query: str) -> dict:
    f = find(query)
    if f is None:
        return {"query": query, "ticker": None, "name": None, "category": None, "behaves_like": None, "match": None,
                "basis": None, "source": None,
                "note": "Not in Precedence's fund list yet, so it isn't mapped to anything we can test."}
    note = NOTES.get(f.category)
    if f.match == "close stand-in":
        note = ("Holds the S&P 500 plus smaller US companies, so SPY is a close stand-in, not the same fund: "
                "its holdings show through SPY's, but SPY's test isn't applied.")
    return {"query": query, "ticker": f.ticker, "name": f.name, "category": f.category,
            "behaves_like": f.behaves_like, "match": f.match, "basis": f"Benchmark: {f.benchmark}",
            "source": f.source, "note": note}
