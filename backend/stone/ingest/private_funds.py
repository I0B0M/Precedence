"""Loads BREIT and BCRED from their SEC filings: monthly Class I NAVs, what each invests in, its repurchase
limits, and links to its latest reports. collect() is pure, so tests run it on saved filings."""

from dataclasses import dataclass, field
from datetime import date
from typing import Callable

import psycopg

from stone.sources import private_funds as pf
from stone.sources.sec import ARCHIVES, Filing

REPORT_FORMS = ("10-Q", "10-K")


def url_of(cik: int, f: Filing) -> str:
    return f"{ARCHIVES}/{cik}/{f.accession.replace('-', '')}/{f.primary_doc}"


@dataclass
class FundLoad:
    fund: pf.Fund
    navs: dict[date, tuple[float, Filing]] = field(default_factory=dict)  # month end -> (Class I NAV, its filing)
    invests_in: tuple[str, str] | None = None  # (quoted text, url)
    liquidity: tuple[str, str] | None = None
    links: list[Filing] = field(default_factory=list)
    skipped: list[Filing] = field(default_factory=list)  # NAV-form filings that state no NAV (other supplements)


def collect(fund: pf.Fund, filings: list[Filing], text_of: Callable[[Filing], str], since: date) -> FundLoad:
    """filings: newest first. text_of: a filing's main document as plain text."""
    out = FundLoad(fund)
    for f in (f for f in filings if f.form == fund.nav_form and f.filed_date >= since):
        nav = pf.parse_nav(fund.ticker, text_of(f))
        if nav is None:
            out.skipped.append(f)
            continue
        if nav.as_of in out.navs and out.navs[nav.as_of][0] != nav.nav:
            kept = out.navs[nav.as_of][1]
            raise pf.ConflictingNav(f"{fund.ticker} {nav.as_of}: {f.accession} says {nav.nav}, "
                                    f"{kept.accession} says {out.navs[nav.as_of][0]}")
        out.navs.setdefault(nav.as_of, (nav.nav, f))  # newest filing first, so a restated month keeps the newest
    report = next((f for f in filings if f.form in REPORT_FORMS), None)
    if report:
        text, url = text_of(report), url_of(fund.cik, report)
        if q := pf.invests_in(fund.ticker, text):
            out.invests_in = (q, url)
        if q := pf.liquidity_note(fund.ticker, text):
            out.liquidity = (q, url)
    latest_nav = max(out.navs.values(), key=lambda v: v[1].filed_date)[1] if out.navs else None
    for form in REPORT_FORMS:
        if f := next((f for f in filings if f.form == form), None):
            out.links.append(f)
    if latest_nav:
        out.links.append(latest_nav)
    return out


def store(conn: psycopg.Connection, load: FundLoad) -> int:
    """Additive: a month already stored with a different NAV stops the load; returns new NAV rows."""
    f = load.fund
    have = {r["as_of"]: float(r["nav"]) for r in conn.execute(
        "select as_of, nav from private_fund_navs where ticker = %s and share_class = %s",
        (f.ticker, pf.SHARE_CLASS)).fetchall()}
    for as_of, (nav, filing) in load.navs.items():
        if as_of in have and have[as_of] != nav:
            raise pf.ConflictingNav(f"{f.ticker} {as_of}: stored {have[as_of]}, {filing.accession} says {nav}")
    conn.execute(
        """insert into private_funds (ticker, cik, name, share_class, nav_form, invests_in, invests_in_url,
                                      liquidity_note, liquidity_url, source)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           on conflict (ticker) do update set invests_in = excluded.invests_in, invests_in_url = excluded.invests_in_url,
               liquidity_note = excluded.liquidity_note, liquidity_url = excluded.liquidity_url""",
        (f.ticker, f.cik, f.name, pf.SHARE_CLASS, f.nav_form, *(load.invests_in or (None, None)),
         *(load.liquidity or (None, None)), pf.SOURCE))
    new = [(f.ticker, pf.SHARE_CLASS, as_of, nav, fl.form, fl.accession, url_of(f.cik, fl), fl.filed_date, pf.SOURCE)
           for as_of, (nav, fl) in load.navs.items() if as_of not in have]
    with conn.cursor() as cur:
        cur.executemany("insert into private_fund_navs values (%s, %s, %s, %s, %s, %s, %s, %s, %s)", new)
        cur.executemany("insert into private_fund_filings values (%s, %s, %s, %s, %s) on conflict do nothing",
                        [(f.ticker, fl.accession, fl.form, fl.accepted_at, url_of(f.cik, fl)) for fl in load.links])
    return len(new)
