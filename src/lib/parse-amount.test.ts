import { describe, it, expect } from "vitest";
import { parseAmount, parseAmountToString } from "./parse-amount";

describe("parseAmount", () => {
  it.each([
    ["1234.56", 1234.56],
    ["1234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["1 234.56", 1234.56],
    ["1'234.56", 1234.56],     // Swiss apostrophe
    ["1 234,56", 1234.56], // non-breaking space
    ["1 234,56", 1234.56], // narrow no-break space
    ["0", 0],
    ["0.5", 0.5],
    ["-100,5", -100.5],
    ["1000000", 1000000],
  ])("parses %s → %s", (input, expected) => {
    expect(parseAmount(input)).toBeCloseTo(expected, 8);
  });

  it("returns NaN for unparseable input", () => {
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount(null)).toBeNaN();
    expect(parseAmount(undefined)).toBeNaN();
  });

  it("passes numbers through", () => {
    expect(parseAmount(123.45)).toBe(123.45);
  });
});

describe("parseAmountToString", () => {
  it("returns Drizzle-numeric-safe string", () => {
    expect(parseAmountToString("1.234,56")).toBe("1234.56");
    expect(parseAmountToString("100")).toBe("100");
    expect(parseAmountToString("0,5")).toBe("0.5");
  });

  it("returns null for invalid", () => {
    expect(parseAmountToString("abc")).toBeNull();
    expect(parseAmountToString("")).toBeNull();
  });

  it("trims trailing zeros", () => {
    expect(parseAmountToString("1.5000")).toBe("1.5");
    expect(parseAmountToString("100.0")).toBe("100");
  });
});
