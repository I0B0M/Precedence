"""Build the saved data the live site (Netlify) reads, since it runs without the backend or database.

    uv run python scripts/build_saved.py

Reads the committed real fixtures (frontend/fixtures/, exported from the real database) and writes
frontend/public/saved/, one JSON file per API response, same shapes as the API. It never changes a
fixture number. Two gaps are filled from Yahoo Finance through yfinance (the downloader QuantStats
uses), and every such number is labeled with that source:
  - high and low for each stock's daily bars (the fixtures carry open and close only), for the candles;
  - SPY's daily bars (no fixture has them), for SPY's chart, the board's sparkline and the risk card.
The risk card itself is QuantStats (stone/portfolio/risk.py) run on those closes.
/today (market and example symbols), each saved ticker's /today and MSFT's company page are copied from the
running API (STONE_API, default http://localhost:8000), refused unless it's on the same trading day.

    uv run python scripts/build_saved.py --live-only  # just those, leaving the other saved files as they are
"""

import json
import os
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

import yfinance as yf

from stone import saved
from stone.briefing import saved as saved_briefings
from stone.api.main import FUND_TOP, PERFORMANCE_BASIS, return_over, risk_json
from stone.config import REPO_DIR
from stone.portfolio.risk import BASIS as RISK_BASIS
from stone.portfolio.risk import portfolio_risk
from stone.signals import engine

FIXTURES = REPO_DIR / "frontend" / "fixtures"
OUT = REPO_DIR / "frontend" / "public" / "saved"
YAHOO = "Yahoo Finance (yfinance)"
MARKET = "SPY"


def fixture(path: str):
    return json.loads((FIXTURES / path).read_text())


def write(path: str, data) -> None:
    f = OUT / f"{path}.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {f.relative_to(REPO_DIR)}")


def holdings_key(holdings: list[dict]) -> str:
    """Same key as savedKey() in frontend/src/lib/api.ts: symbols sorted, 'SYM-shares' joined by '_'."""
    return "_".join(f"{h['symbol'].upper()}-{h['shares']:g}" for h in sorted(holdings, key=lambda h: h["symbol"].upper()))


board = fixture("holdings.json")
request, response = board["data"]["request"], board["data"]["response"]
as_of = board["meta"]["as_of"]
stocks = sorted({h["symbol"] for h in request["holdings"]} - {MARKET})
companies = {t: fixture(f"{t}/company.json")["data"] for t in stocks}
first_day = min(p["day"] for c in companies.values() for p in c["prices"])
API = os.getenv("STONE_API", "http://localhost:8000")


def live_extras() -> None:
    """Responses the saved demo also needs that the fixtures don't carry, copied from the running API (GET only):
    /api/today with and without the example's symbols, each saved ticker's /today, and MSFT (a look-through
    sparkline on the board). Refused unless the API's last trading day is the saved data's."""
    import httpx
    get = lambda path: httpx.get(f"{API}{path}", timeout=120).raise_for_status().json()
    market_day = get("/api/today")
    if market_day["day"] != as_of:
        raise SystemExit(f"The API at {API} is on {market_day['day']}, the saved data on {as_of}; not mixing them.")
    asked = ",".join(h["symbol"] for h in request["holdings"])  # the example's order, as the start screen asks
    saved_as = ",".join(sorted(set(asked.split(","))))  # the file name savedFile() in api.ts looks up, any order
    files = {"today": market_day, f"today/{saved_as}": get(f"/api/today?symbols={asked}"),
             "companies/MSFT": get("/api/companies/MSFT"),
             **{f"companies/{t}/today": get(f"/api/companies/{t}/today") for t in [*stocks, MARKET]}}
    for path, data in files.items():
        if "Stone" in json.dumps(data):
            raise SystemExit(f"{path}: says 'Stone'; the product is Precedence on screen.")
        write(path, data)

    # fdr10_survives (the correction for testing many stocks at once) on every saved signal: the fixtures were
    # exported before the field existed. It's the only field added; no other saved number changes.
    fdr = {(t, s["signal"]): s.get("fdr10_survives") for t in stocks for s in get(f"/api/companies/{t}")["signals"]}

    def mark(ticker: str, signal: dict) -> None:
        if "signal" in signal:
            signal["fdr10_survives"] = fdr.get((ticker, signal["signal"]))  # None: not in that run (the market card)

    for t in stocks:
        c = json.loads((OUT / "companies" / f"{t}.json").read_text())
        for s in c["signals"]:
            mark(t, s)
        write(f"companies/{t}", c)
        for lab in sorted((OUT / "lab" / t).glob("*.json")):
            doc = json.loads(lab.read_text())
            mark(t, doc)
            write(f"lab/{t}/{lab.stem}", doc)
    for board in sorted((OUT / "portfolio").glob("*.json")):
        doc = json.loads(board.read_text())
        for e in doc.get("exposure") or []:
            for s in e.get("firing") or []:
                mark(e["symbol"], s)
        write(f"portfolio/{board.stem}", doc)


if "--live-only" in sys.argv:  # just the files above, leaving the rest of frontend/public/saved as it is
    live_extras()
    raise SystemExit(0)

bars = yf.download([*stocks, MARKET], start=first_day, end=date.fromisoformat(as_of) + timedelta(days=1),
                   auto_adjust=False, progress=False, group_by="ticker", timeout=30)
if bars.empty:
    raise SystemExit("Yahoo Finance returned nothing; try again.")


def yahoo_rows(t: str) -> dict[str, dict]:
    df = bars[t].dropna()
    return {d.strftime("%Y-%m-%d"): {"open": float(r["Open"]), "high": float(r["High"]), "low": float(r["Low"]),
                                     "close": float(r["Close"])} for d, r in df.iterrows()}


if OUT.exists():
    shutil.rmtree(OUT)

# ---- stocks: fixture as exported, plus Yahoo's high/low (widened to always contain the fixture's open and close)
for t, c in companies.items():
    y = yahoo_rows(t)
    for p in c["prices"]:
        yp = y.get(p["day"])
        if yp:
            p["high"] = round(max(yp["high"], p["open"], p["close"]), 4)
            p["low"] = round(min(yp["low"], p["open"], p["close"]), 4)
    c["price_sources"] = {"close": "Alpaca (IEX feed)", "high_low": YAHOO}
    write(f"companies/{t}", c)
    for key in engine.SPECS:
        write(f"lab/{t}/{key}", fixture(f"{t}/lab_{key}.json")["data"])

# ---- SPY: the same shape /api/companies/SPY returns, from Yahoo bars plus the fixtures' SPY test and board row
spy_row = next(r for r in response["rows"] if r["symbol"] == MARKET)
spy_exposure = next(e for e in response["exposure"] if e["symbol"] == MARKET)
market = fixture("market_rate_jump.json")["data"]
spy_bars = [{"day": d, **{k: round(v, 4) for k, v in b.items()}} for d, b in sorted(yahoo_rows(MARKET).items())
            if first_day <= d <= as_of]
spy = {
    "company": {"ticker": MARKET, "cik": None, "name": spy_row["name"], "sector": spy_exposure["sector"], "kind": "etf",
                "source": "alpaca-iex"},
    "last": {"close": spy_row["price"], "day": as_of, "change": spy_row["change"]},
    "prices": spy_bars,
    "filings": [], "insider_sales": [], "facts": [],
    "rate": companies["BX"]["rate"],
    "signals": [{k: v for k, v in market.items() if k != "symbol"}],
    "state": spy_exposure["state"],
    "price_sources": {"close": YAHOO, "high_low": YAHOO,
                      "last": "Alpaca (IEX feed), the close the board is priced at"},
}
write(f"companies/{MARKET}", spy)

# ---- SPY's fund page (GET /api/funds/SPY): weights recovered from the saved board's look-through
# (each stock's dollars inside SPY over SPY's dollars), states only where the saved board has them.
spy_value = spy_exposure["direct"]
inside = {e["symbol"]: e for e in response["exposure"] if MARKET in e["via_etf"]}
weights = {**{s: e["via_etf"][MARKET] / spy_value for s, e in inside.items()},
           **{k["symbol"]: k["total"] / spy_value for k in spy_exposure["children"]}}
names = {**{s: e["name"] for s, e in inside.items()}, **{k["symbol"]: k["name"] for k in spy_exposure["children"]}}


def lite_line(e: dict | None) -> str | None:
    if e is None:
        return None
    strong = next((f for f in e["firing"] if f["label"] == engine.STRONG), None)
    if strong:
        return f"{engine.ALL_SPECS[strong['signal']].lite}, and for this stock that has mattered before."
    if e["firing"]:
        return f"{engine.ALL_SPECS[e['firing'][0]['signal']].lite}, but that hasn't clearly mattered here before."
    return "Nothing important today."


top = sorted(weights, key=lambda t: -weights[t])[:FUND_TOP]
holdings = [{"ticker": t, "name": names[t], "weight": weights[t], "in_stone": True,
             "state": inside[t]["state"] if t in inside else None,
             "firing": [{"signal": f["signal"], "label": f["label"]} for f in inside[t]["firing"]] if t in inside else [],
             "lite_line": lite_line(inside.get(t))} for t in top]
spy_closes = [(p["day"], p["close"]) for p in spy_bars]
write(f"funds/{MARKET}", {
    "symbol": MARKET, "name": spy_row["name"],
    "price": {"last_close": spy_row["price"], "as_of": as_of, "prev_close": spy_row["price"] / (1 + spy_row["change"]),
              "change_1d": spy_row["change"]},
    "performance": {"d30": return_over(spy_closes, 21), "d90": return_over(spy_closes, 63), "y1": return_over(spy_closes, 252),
                    "as_of": spy_closes[-1][0], "basis": f"{PERFORMANCE_BASIS}; SPY closes from {YAHOO}"},
    "fund_state": spy_exposure["state"],
    "fund_firing": spy_exposure["firing"],
    "holdings_as_of": board["data"]["response"]["funds"][0]["as_of"],
    "holdings_source": board["data"]["response"]["funds"][0]["source"],
    "total_holdings_count": 504,  # rows in State Street's SPY file as loaded (HANDOFF.md)
    "looked_through_share": board["data"]["response"]["funds"][0]["looked_through"],
    "holdings": holdings,
    "heads_up": [{"ticker": h["ticker"], "name": h["name"], "weight": h["weight"]} for h in holdings if h["state"] == engine.WATCH],
    "filings_span": None, "week_filings": [],
    "note": None,
})

write("companies", [
    *({"ticker": t, "name": c["company"]["name"], "sector": c["company"]["sector"], "kind": "stock",
       "source": c["company"]["source"], "last_close": c["last"]["close"], "as_of": c["last"]["day"],
       "change": c["last"]["change"]} for t, c in companies.items()),
    {"ticker": MARKET, "name": spy_row["name"], "sector": spy_exposure["sector"], "kind": "etf", "source": "alpaca-iex",
     "last_close": spy_row["price"], "as_of": as_of, "change": spy_row["change"]},
])
write("status", {"data": "real", "companies_by_source": {"sec": len(companies), "alpaca-iex": 1}})
write("lab/signals", [{"key": s.key, "lite": s.lite, "pro": s.pro, "horizon": s.horizon} for s in engine.SPECS.values()])
write("market/rate_jump", market)

# The last full scan, as recorded in HANDOFF.md (run 2026-09-26 19:27 ET on the real database, prices to 2026-09-25).
write("scan", {"run_at": "2026-09-26T19:27:00-04:00", "stocks": 103, "tested": 309, "eligible": 115, "strong": 11,
               "strong_held_up": 0, "strong_fdr10": 0, "expected_by_chance": 5.75, "as_of": "2026-09-25"})

key = holdings_key(request["holdings"])
write(f"portfolio/{key}", response)

# ---- risk card for the saved board: stocks on their fixture closes (IEX), SPY on Yahoo's
closes = {t: [(date.fromisoformat(p["day"]), p["close"]) for p in c["prices"]] for t, c in companies.items()}
closes[MARKET] = [(date.fromisoformat(p["day"]), p["close"]) for p in spy_bars]
values = {r["symbol"]: r["value"] for r in response["rows"]}
mine, mkt, rets = portfolio_risk(closes, values, MARKET)
total = sum(values.values())
write(f"portfolio/risk/{key}", {
    "total": total, "symbols": sorted(values), "unknown": [], "market_symbol": MARKET,
    "start": rets.index.min().date().isoformat(), "end": rets.index.max().date().isoformat(), "days": len(rets),
    "portfolio": risk_json(mine, total), "market": risk_json(mkt),
    "basis": RISK_BASIS, "source": f"QuantStats on daily closes: stocks from Alpaca (IEX feed), SPY from {YAHOO}",
})

write("index", {"as_of": as_of, "tickers": [*stocks, MARKET], "example": request["holdings"], "example_key": key,
                "sources": {"fixtures": "frontend/fixtures (real database export)", "fill_ins": YAHOO}})

live_extras()  # /today and MSFT, from the running API
saved.finish(OUT)  # strict and the current hold-out verdict, rebuilt from the files just written
saved_briefings.build(OUT)  # the narration tab's lines, from the finished files
