import { describe, expect, it } from "vitest";
import { csvRows, NotRobinhoodCsv, readRobinhoodCsv } from "../robinhood";

// Shaped like Robinhood's account activity report (its column names, quoted fields, a description that runs onto a
// second line, amounts in parentheses when money goes out, a note at the end). Made-up trades, not a real export.
const SAMPLE = `\uFEFF"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"9/24/2026","9/24/2026","9/25/2026","AMZN","Amazon
CUSIP: 023135106","Buy","2","$249.63","($499.26)"
"9/2/2026","9/2/2026","9/3/2026","BX","Blackstone
CUSIP: 09260D107","Sell","5","$120.10","$600.50"
"8/15/2026","8/15/2026","8/15/2026","BX","Cash Div: R/D 2026-08-04 P/D 2026-08-15 - 45 shares at 0.93","CDIV","","","$41.85"
"7/1/2026","7/1/2026","7/2/2026","","ACH Deposit","ACH","","","$1,000.00"
"6/10/2026","6/10/2026","6/10/2026","NVDA","NVIDIA
CUSIP: 67066G104","SPL","90","",""
"6/3/2026","6/3/2026","6/4/2026","AAPL","AAPL 6/19/2026 Call $250.00","BTO","1","$3.20","($320.00)"
"5/20/2026","5/20/2026","5/21/2026","TSLA","Tesla
CUSIP: 88160R101","REC","3","",""
"4/1/2026","4/1/2026","4/2/2026","BRK-B","Berkshire Hathaway Class B","Buy","0.512345","$480.00","($245.93)"
"3/5/2026","3/5/2026","3/6/2026","NVDA","NVIDIA
CUSIP: 67066G104","Buy","10","$880.00","($8,800.00)"
"2/2/2026","2/2/2026","2/3/2026","MSFT","Microsoft
CUSIP: 594918104","Sell","4","$410.00","$1,640.00"
"1/4/2024","1/4/2024","1/5/2024","BX","Blackstone
CUSIP: 09260D107","Buy","1,050","$118.00","($123,900.00)"
"1/4/2024","1/4/2024","1/5/2024","AMZN","Amazon
CUSIP: 023135106","Buy","10","$150.00","($1,500.00)"
"1/4/2024","1/4/2024","1/5/2024","SPY","SPDR S&P 500 ETF","Buy","3","$470.00","($1,410.00)"
"1/4/2024","1/4/2024","1/5/2024","SPY","SPDR S&P 500 ETF","Sell","3","$471.00","$1,413.00"
"","","","","","","","","The data provided is for informational purposes only."
`;

describe("readRobinhoodCsv: holdings counted from Robinhood's account activity", () => {
  const r = readRobinhoodCsv(SAMPLE);

  it("adds up buys, sells and splits per ticker", () => {
    expect(r.holdings).toEqual([
      { symbol: "AMZN", shares: 12 },
      { symbol: "BRK.B", shares: 0.512345 },
      { symbol: "BX", shares: 1045 },
      { symbol: "NVDA", shares: 100 },
    ]);
  });

  it("says what it didn't count instead of guessing", () => {
    expect(r.check).toEqual([
      { symbol: "AAPL", why: "Options aren't counted." },
      { symbol: "MSFT", why: "More sold than bought in this file. It may not start when the account opened." },
      { symbol: "TSLA", why: "1 REC line isn't counted. Check its shares." },
    ]);
  });

  it("gives the dates the file covers", () => {
    expect([r.from, r.to]).toEqual(["2024-01-04", "2026-09-24"]);
  });

  it("refuses a file that isn't Robinhood's activity report", () => {
    expect(() => readRobinhoodCsv("Symbol,Shares\nAAPL,10\n")).toThrow(NotRobinhoodCsv);
    expect(() => readRobinhoodCsv("")).toThrow(NotRobinhoodCsv);
  });

  it("reads unquoted fields, Windows line ends and a quote inside a field", () => {
    const plain = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\r
09/25/2026,09/25/2026,09/26/2026,JPM,"JPMorgan ""JPM""",Buy,7,$300.00,($2100.00)\r
`;
    const p = readRobinhoodCsv(plain);
    expect(p.holdings).toEqual([{ symbol: "JPM", shares: 7 }]);
    expect(p.check).toEqual([]);
    expect([p.from, p.to]).toEqual(["2026-09-25", "2026-09-25"]);
  });
});

describe("csvRows: the CSV rules Robinhood's file follows", () => {
  it("keeps commas, line breaks and doubled quotes inside quoted fields", () => {
    expect(csvRows('a,"b, ""c""\nd",e\r\nf,,\n')).toEqual([["a", 'b, "c"\nd', "e"], ["f", "", ""]]);
  });
});
