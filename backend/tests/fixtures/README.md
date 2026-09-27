Hand-written files in each API's response format, for testing the parsers.
They are NOT real filings or real prices. Values are made up; only the shape matches.

Exception: `spdr_spy_holdings.xlsx` is State Street's real published SPY holdings file
(holdings as of 24-Sep-2026), saved unchanged so the parser is tested on the real layout.

`demo_screenshot.png` is a made-up brokerage screen ("Demo Broker") drawn by
`scripts/make_demo_screenshot.py`: real tickers at their 2026-09-25 closes, illustrative share
counts, a cash line and a printed total that adds up. `scripts/check_gemini.py` reads it by default.
