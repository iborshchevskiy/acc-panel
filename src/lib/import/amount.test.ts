import { describe, it, expect } from "vitest";
import { rawToDecimalString } from "./amount";

describe("rawToDecimalString", () => {
  it("converts wei (18 decimals) without precision loss", () => {
    // 0.123456789012345678 ETH — past the 2^53 safe-integer threshold for parseInt
    expect(rawToDecimalString("123456789012345678", 18)).toBe("0.123456789012345678");
    expect(rawToDecimalString("1234567890123456789012", 18)).toBe("1234.567890123456789012");
  });

  it("converts USDT/TRX sun (6 decimals)", () => {
    expect(rawToDecimalString("20500000", 6)).toBe("20.5");
    expect(rawToDecimalString("1", 6)).toBe("0.000001");
  });

  it("converts SOL lamports (9 decimals)", () => {
    expect(rawToDecimalString("1000000000", 9)).toBe("1");
    expect(rawToDecimalString("123", 9)).toBe("0.000000123");
  });

  it("returns 0 for zero / empty input", () => {
    expect(rawToDecimalString("0", 18)).toBe("0");
    expect(rawToDecimalString("", 6)).toBe("0");
    expect(rawToDecimalString(0, 9)).toBe("0");
  });

  it("trims trailing zeros after decimal point but keeps at least one digit", () => {
    expect(rawToDecimalString("1000000", 6)).toBe("1");
    expect(rawToDecimalString("1500000", 6)).toBe("1.5");
  });

  it("handles negative amounts (rare but possible for net-flow accounting)", () => {
    expect(rawToDecimalString("-20500000", 6)).toBe("-20.5");
  });

  it("decimals=0 preserves integer", () => {
    expect(rawToDecimalString("42", 0)).toBe("42");
    expect(rawToDecimalString("00042", 0)).toBe("42");
  });

  it("recovers from scientific-notation input without crashing", () => {
    // Lossy but graceful.
    expect(rawToDecimalString("1e6", 6)).toBe("1");
  });
});
