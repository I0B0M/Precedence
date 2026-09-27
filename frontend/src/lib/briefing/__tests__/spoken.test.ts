import { describe, expect, it } from "vitest";
import { estimateMs, spokenName, toSpeech, wordsReached } from "../spoken";

const names = { BX: "Blackstone", AMZN: "Amazon", SPY: "SPDR S&P 500 ETF", "BRK.B": "Berkshire Hathaway Inc." };

describe("toSpeech", () => {
  it("reads money, percentages and points as words", () => {
    expect(toSpeech("Worth $16,627, up $150 (+0.9%) after a 0.24 pt jump.", {})).toBe("Worth 16,627 dollars, up 150 dollars (+0.9 percent) after a 0.24 points jump.");
  });
  it("swaps tickers for names, longest first, and SPY for the fund", () => {
    expect(toSpeech("BX and AMZN inside SPY; BRK.B too.", names)).toBe("Blackstone and Amazon inside the S and P 500 fund; Berkshire Hathaway too.");
  });
  it("spells out a ticker it has no name for", () => {
    expect(spokenName("MSFT", {})).toBe("M S F T");
  });
});

describe("wordsReached", () => {
  it("maps a fraction of the spoken text onto the caption's words", () => {
    expect(wordsReached("one two three four", 0)).toBe(0);
    expect(wordsReached("one two three four", 0.5)).toBe(2);
    expect(wordsReached("one two three four", 1)).toBe(4);
    expect(wordsReached("one two three four", NaN)).toBe(0);
    expect(wordsReached("one two three four", 7)).toBe(4);
  });
});

describe("estimateMs", () => {
  it("never goes below a beat and grows with the words", () => {
    expect(estimateMs("")).toBe(1200);
    expect(estimateMs("a b c d e f g h i j k l m n o p q r s t u v w x y z ab cd")).toBeGreaterThan(9000);
  });
});
