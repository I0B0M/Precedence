"""Display names for companies. SEC and fund files print legal names ("Costco Wholesale Corp /New",
"MICRON TECHNOLOGY INC"); pages show a clean one. The legal name is always kept alongside."""

import re

# Where the rules below can't get it right: SEC's own casing ("Mcdonalds", "Pepsico") or punctuation (AT&T).
OVERRIDES = {
    "T": "AT&T", "USB": "U.S. Bancorp", "MCD": "McDonald's", "SCHW": "Charles Schwab", "LLY": "Eli Lilly",
    "PG": "Procter & Gamble", "CVS": "CVS Health", "LOW": "Lowe's", "FDX": "FedEx", "COP": "ConocoPhillips",
    "PEP": "PepsiCo", "MET": "MetLife", "NEE": "NextEra Energy", "UNH": "UnitedHealth Group",
    "CL": "Colgate-Palmolive", "SO": "Southern Company",
}

STATE = re.compile(r"\s*/[A-Za-z]{2,3}/?\s*$")  # "Corp /De/", "Inc/De", "Corp /New", "& Company/Mn"
LEGAL = re.compile(r"[\s,]+(inc|incorporated|corp|corporation|co|company|plc|ltd|limited|llc|n\.?v|nv|s\.?a|ag|se)\.?$",
                   re.IGNORECASE)
AND_CO = re.compile(r"\s*&\s*(co|company)\.?$", re.IGNORECASE)
MID_LEGAL = re.compile(r"\s+(inc|corp|co)\.?(?=\s+class\s)", re.IGNORECASE)  # "Alphabet Inc Class C"
SHARE_CLASS = re.compile(r"\s+(?:CL|CLASS|INC|CORP)\s+([A-Z])$")  # "ALPHABET INC CL C", "CROWDSTRIKE HOLDINGS INC A"
VOWELS = set("AEIOUY")
# Acronyms with vowels that the rule below would otherwise turn into "Kla" or "Etf"
ACRONYMS = {"ETF", "SPDR", "KLA", "ICE", "AES", "EOG", "ARM", "ASML", "NXP", "CME", "HCA", "LKQ", "TKO", "UDR", "EQT",
            "MSCI", "IQVIA", "NVR", "AIG", "IBM", "AMD", "ADR"}


def _word(w: str) -> str:
    """One word of an ALL-CAPS name. Acronyms (no vowels: HP, CSX, NRG; two letters: GE; the list above) and
    words with digits or & stay as printed."""
    if (any(ch.isdigit() or ch == "&" for ch in w) or not (set(w.upper()) & VOWELS) or len(w) <= 2
            or w in ACRONYMS):
        return w
    return "-".join(p[:1].upper() + p[1:].lower() for p in w.split("-"))


def display_name(ticker: str | None, raw: str | None) -> str | None:
    if ticker and ticker in OVERRIDES:
        return OVERRIDES[ticker]
    if not raw:
        return raw
    name = " ".join(raw.split())
    if " " in name and name == name.upper():  # a whole name in capitals, as fund files print it
        name = SHARE_CLASS.sub(r" CLASS \1", name)
        name = " ".join(_word(w) for w in name.split())
    before = None
    while before != name:  # suffixes stack: "Charter Communications, Inc. /Mo/"
        before = name
        name = STATE.sub("", name)
        name = AND_CO.sub("", name)  # before LEGAL, or "Deere & Co" loses only the "Co"
        name = LEGAL.sub("", name)
        name = MID_LEGAL.sub("", name).strip(" ,")
    return name or raw
