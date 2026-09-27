"""Blackstone's non-traded funds, from their own SEC filings only.

They have no daily price. Each month the fund reports a net asset value (NAV) per share:
  BREIT (Blackstone Real Estate Income Trust)  in a 424B3 prospectus supplement, per-class table
  BCRED (Blackstone Private Credit Fund)        in an 8-K, Item 8.01
Every value is kept with the filing it came from; a month with no filing stating it has no value.
Class I is used for both: the class with no upfront selling commission or servicing fee.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime

SOURCE = "sec"
SHARE_CLASS = "I"


@dataclass(frozen=True)
class Fund:
    ticker: str
    cik: int
    name: str
    nav_form: str  # the form that reports the monthly NAV


FUNDS = {
    "BREIT": Fund("BREIT", 1662972, "Blackstone Real Estate Income Trust", "424B3"),
    "BCRED": Fund("BCRED", 1803498, "Blackstone Private Credit Fund", "8-K"),
}


@dataclass(frozen=True)
class Nav:
    as_of: date  # the month end the NAV is calculated for
    nav: float  # per Class I share, as printed


class ConflictingNav(ValueError):
    """Two filings state different NAVs for the same month; neither is stored."""


def _day(text: str) -> date:
    return datetime.strptime(" ".join(text.replace(",", ", ").split()), "%B %d, %Y").date()


DAY = r"([A-Z][a-z]+ \d{1,2}, ?\d{4})"
# BREIT since late 2025, one row per class:
#   "NAV Per Share/Unit as of August 31, 2026 Class I Shares $ 32,174,812 2,191,006 $ 14.6850"
BREIT_ROWS = re.compile(rf"NAV Per Share/Unit as of {DAY}\s+Class I Shares\s+\$\s*[\d,]+\s+[\d,]+\s+\$\s*(\d+\.\d+)")
# BREIT before that, one column per class, named in the header:
#   "by class as of August 31, 2025 (...): Third-party Operating Class S Class I Class T Class D Class C Partnership
#    NAV Per Share/Unit ... NAV Per Share/Unit as of August 31, 2025 $ 13.8187 $ 13.8281 $ 13.5863 ..."
BREIT_COLUMNS = re.compile(rf"by class as of {DAY} \([^)]*\): (?:Third-party )?(?:Operating )?((?:Class [A-Z0-9-]+ )+)"
                           rf"Partnership NAV Per Share/Unit .*? NAV Per Share/Unit as of \1 ((?:\$ \d+\.\d+ ?)+)")
# BREIT's summary sentence, to 2 decimals: "BREIT's Class I NAV per share was $14.69"
BREIT_SENTENCE = re.compile(r"Class I NAV per share was \$(\d+\.\d{2})\b")
# BCRED: "NAV as of August 31, 2026 Class I Common Shares $ 23.60"
BCRED_LINE = re.compile(rf"NAV as of {DAY}\s+Class I Common Shares\s+\$\s*(\d+\.\d+)")


class NavMismatch(ValueError):
    """The table and the filing's own sentence disagree, so the table was misread; nothing is stored."""


def _breit(text: str) -> Nav | None:
    if m := BREIT_ROWS.search(text):
        nav = Nav(_day(m.group(1)), float(m.group(2)))
    elif m := BREIT_COLUMNS.search(text):
        classes = re.findall(r"Class ([A-Z0-9-]+)", m.group(2))
        values = re.findall(r"\$ (\d+\.\d+)", m.group(3))
        if "I" not in classes or len(values) <= classes.index("I"):
            return None
        nav = Nav(_day(m.group(1)), float(values[classes.index("I")]))
    else:
        return None
    if (s := BREIT_SENTENCE.search(text)) and f"{nav.nav:.2f}" != s.group(1):
        raise NavMismatch(f"Table says Class I ${nav.nav} for {nav.as_of}, the filing's sentence says ${s.group(1)}.")
    return nav


def parse_nav(ticker: str, text: str) -> Nav | None:
    """The Class I NAV the filing reports for its own month, or None if it doesn't report one.
    BREIT's supplement also repeats the prior month's table; the first table is the new month."""
    text = " ".join(text.split())
    if ticker == "BREIT":
        return _breit(text)
    m = BCRED_LINE.search(text)
    return Nav(_day(m.group(1)), float(m.group(2))) if m else None


# What it invests in, quoted from its 10-Q / 10-K (at most 12 words; "…" marks words left out)
INVESTS = {
    "BREIT": (re.compile(r"invests primarily in (stabilized, income-generating commercial real estate in the United States)"),
              "Invests primarily in {0}"),
    "BCRED": (re.compile(r"invest primarily in (originated loans and other securities), including broadly syndicated loans, "
                         r"(of U\.S\. private companies)"),
              "Invests primarily in {0} … {1}"),
}
# Its own repurchase limits, quoted from its 10-Q / 10-K
LIQUIDITY = {
    "BREIT": (re.compile(r"(limited to no more than 2% of our aggregate NAV per month) \([^)]*\) "
                         r"(and no more than 5% of our aggregate NAV per calendar quarter)"),
              'Repurchases are "{0} … {1}"'),
    "BCRED": (re.compile(r"at the discretion of the Board, (the Company may repurchase, in each quarter, up to 5 ?% of the NAV "
                         r"of the Company’s Common Shares outstanding) \([^)]*\) (as of the close of the previous calendar "
                         r"quarter)"),
              '"{0} … {1}", at the discretion of the Board'),
}


def _quote(patterns: dict, ticker: str, text: str) -> str | None:
    pattern, template = patterns[ticker]
    m = pattern.search(" ".join(text.split()))
    return template.format(*(g.replace("5 %", "5%") for g in m.groups())) if m else None


def invests_in(ticker: str, text: str) -> str | None:
    return _quote(INVESTS, ticker, text)


def liquidity_note(ticker: str, text: str) -> str | None:
    return _quote(LIQUIDITY, ticker, text)


def month_back(d: date, months: int) -> date:
    """The month end `months` before month end `d`."""
    y, m = divmod(d.year * 12 + d.month - 1 - months, 12)
    m += 1
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)
