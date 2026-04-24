import { describe, it, expect } from "vitest";
import { runFifo, type FifoTxRow } from "./engine";

// In production: EUR/CZK/RUB are fiat, USDT is the pricing base (not fiat).
const FIAT = new Set(["EUR", "CZK"]);

function row(
  id: string,
  timestamp: string,
  incomeAmount: string | null,
  incomeCurrency: string | null,
  outcomeAmount: string | null,
  outcomeCurrency: string | null
): FifoTxRow {
  return {
    id,
    timestamp: new Date(timestamp),
    transactionType: "Exchange",
    incomeAmount,
    incomeCurrency,
    outcomeAmount,
    outcomeCurrency,
  };
}

describe("runFifo", () => {
  it("returns empty result for empty input", () => {
    const result = runFifo([], FIAT);
    expect(result.pairs).toEqual({});
    expect(result.summary).toEqual([]);
  });

  it("records a simple buy", () => {
    // Buy 1000 EUR @ 1.08 USDT/EUR
    const rows = [row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT")];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair).toBeDefined();
    expect(pair.totalAcquired).toBeCloseTo(1000);
    expect(pair.currentHolding).toBeCloseTo(1000);
    expect(pair.lots).toHaveLength(1);
    expect(pair.lots[0].costRate).toBeCloseTo(1.08);
    expect(pair.disposals).toHaveLength(0);
    expect(pair.totalRealizedGain).toBe(0);
  });

  it("records a simple sell and computes gain", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT"), // buy 1000 EUR @ 1.08
      row("t2", "2024-06-01", "1200", "USDT", "1000", "EUR"), // sell 1000 EUR @ 1.20 → +120 USDT
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].gain).toBeCloseTo(120); // (1.20 - 1.08) × 1000
    expect(pair.disposals[0].gainCurrency).toBe("USDT");
    expect(pair.totalRealizedGain).toBeCloseTo(120);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("correctly applies FIFO ordering across multiple lots", () => {
    const rows = [
      row("t1", "2024-01-01", "100", "EUR", "90", "USDT"),  // lot1: 100 EUR @ 0.90
      row("t2", "2024-02-01", "100", "EUR", "100", "USDT"), // lot2: 100 EUR @ 1.00
      row("t3", "2024-06-01", "110", "USDT", "100", "EUR"), // sell 100 EUR @ 1.10
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    // Should consume lot1 first (FIFO): gain = (1.10 - 0.90) × 100 = 20 USDT
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].costRate).toBeCloseTo(0.90);
    expect(pair.disposals[0].gain).toBeCloseTo(20);
    // lot2 should remain
    expect(pair.currentHolding).toBeCloseTo(100);
    expect(pair.lots).toHaveLength(1);
    expect(pair.lots[0].costRate).toBeCloseTo(1.00);
  });

  it("splits a lot correctly when selling partial", () => {
    const rows = [
      row("t1", "2024-01-01", "2000", "EUR", "2000", "USDT"), // 2000 EUR @ 1.00
      row("t2", "2024-06-01", "1500", "USDT", "1000", "EUR"), // sell 1000 EUR @ 1.50
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals[0].amount).toBeCloseTo(1000);
    expect(pair.disposals[0].gain).toBeCloseTo(500); // (1.50 - 1.00) × 1000
    expect(pair.currentHolding).toBeCloseTo(1000);
    expect(pair.lots[0].remainingAmount).toBeCloseTo(1000);
  });

  it("handles sell spanning multiple lots", () => {
    const rows = [
      row("t1", "2024-01-01", "100", "EUR", "100", "USDT"), // lot1: 100 EUR @ 1.00
      row("t2", "2024-02-01", "100", "EUR", "200", "USDT"), // lot2: 100 EUR @ 2.00
      row("t3", "2024-06-01", "600", "USDT", "200", "EUR"), // sell 200 EUR @ 3.00
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    // 2 disposals: one from each lot
    expect(pair.disposals).toHaveLength(2);
    const totalGain = pair.disposals.reduce((s, d) => s + d.gain, 0);
    // lot1: (3.00 - 1.00) × 100 = 200; lot2: (3.00 - 2.00) × 100 = 100; total = 300
    expect(totalGain).toBeCloseTo(300);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("selling fiat with no lots creates a short position (no immediate disposal)", () => {
    // Sell EUR before ever buying it — opens a short, not a disposal
    const rows = [row("t1", "2024-01-01", "1200", "USDT", "1000", "EUR")];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals).toHaveLength(0);
    // currentHolding is negative while the short is open
    expect(pair.currentHolding).toBeCloseTo(-1000);
  });

  it("short sell is closed with gain when fiat is subsequently bought", () => {
    const rows = [
      row("t1", "2024-01-01", "1200", "USDT", "1000", "EUR"), // short: sell EUR @ 1.20
      row("t2", "2024-06-01", "1000", "EUR", "900", "USDT"),  // close: buy EUR @ 0.90 → gain = (1.20-0.90)×1000 = 300
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].proceedsRate).toBeCloseTo(1.20);
    expect(pair.disposals[0].costRate).toBeCloseTo(0.90);
    expect(pair.disposals[0].gain).toBeCloseTo(300);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("ignores non-Exchange transactions", () => {
    const rows = [
      {
        id: "t1",
        timestamp: new Date("2024-01-01"),
        transactionType: "Revenue",
        incomeAmount: "1000",
        incomeCurrency: "EUR",
        outcomeAmount: null,
        outcomeCurrency: null,
      },
    ];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("ignores crypto-to-crypto swaps (both legs non-fiat)", () => {
    const rows = [row("t1", "2024-01-01", "1000", "USDT", "0.5", "BTC")];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("fiat-to-fiat swap with no prior lots creates a short but no disposals", () => {
    // EUR→CZK with no EUR lots: creates an EUR short (rate=0); no USDT gain recorded
    const rows = [row("t1", "2024-01-01", "50000", "CZK", "1000", "EUR")];
    const result = runFifo(rows, FIAT);
    // No disposals anywhere — the short is pure internal state
    const allDisposals = Object.values(result.pairs).flatMap((p) => p.disposals);
    expect(allDisposals).toHaveLength(0);
  });

  it("handles multiple currency pairs independently", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT"), // buy EUR
      row("t2", "2024-01-02", "50000", "CZK", "1000", "USDT"), // buy CZK
      row("t3", "2024-06-01", "1200", "USDT", "1000", "EUR"),  // sell EUR @ profit
    ];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(2);
    expect(result.pairs["EUR/USDT"].totalRealizedGain).toBeCloseTo(120); // (1.20-1.08)×1000
    expect(result.pairs["CZK/USDT"].totalRealizedGain).toBe(0);
    expect(result.pairs["CZK/USDT"].currentHolding).toBeCloseTo(50000);
  });

  it("summary orders by absolute realized gain descending", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1000", "USDT"),   // EUR @ 1.00
      row("t2", "2024-01-01", "10000", "CZK", "1000", "USDT"),  // CZK @ 0.10
      row("t3", "2024-06-01", "1100", "USDT", "1000", "EUR"),   // sell EUR → +100
      row("t4", "2024-06-01", "2000", "USDT", "10000", "CZK"),  // sell CZK → +1000
    ];
    const result = runFifo(rows, FIAT);
    expect(result.summary[0].pair).toBe("CZK/USDT");
    expect(result.summary[1].pair).toBe("EUR/USDT");
  });

  it("avgCost reflects weighted average of remaining lots", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1000", "USDT"), // 1000 EUR @ 1.00
      row("t2", "2024-02-01", "3000", "EUR", "3000", "USDT"), // 3000 EUR @ 1.00
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.currentHolding).toBeCloseTo(4000);
    expect(pair.avgCost).toBeCloseTo(1.00);
  });

  it("avgCost is null when holding is zero", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT"),
      row("t2", "2024-06-01", "1200", "USDT", "1000", "EUR"),
    ];
    const result = runFifo(rows, FIAT);
    expect(result.pairs["EUR/USDT"].avgCost).toBeNull();
  });

  // Regression: fiat/fiat-origin shorts (proceedsRate=0) must not produce
  // a disposal entry when closed by a USDT buy — doing so yields a
  // spurious negative gain in USDT.
  it("closing a fiat/fiat-origin short via USDT buy produces no disposal", () => {
    const FIAT2 = new Set(["CZK", "RUB"]);
    const rows = [
      // TX1: sell CZK for RUB — no CZK lots exist, so a CZK short (rate=0) is created
      row("t1", "2024-01-01", "150000", "RUB", "50000", "CZK"),
      // TX2: buy CZK with USDT — closes the rate=0 short; must NOT emit a disposal
      row("t2", "2024-02-01", "50000", "CZK", "1000", "USDT"),
    ];
    const result = runFifo(rows, FIAT2);
    const pair = result.pairs["CZK/USDT"];
    expect(pair).toBeDefined();
    // No disposal: the short was rate=0 and must be drained silently
    expect(pair.disposals).toHaveLength(0);
    expect(pair.totalRealizedGain).toBe(0);
  });

  // Regression: same rule applies when a rate=0 short is closed by a
  // fiat/fiat swap (the incoming-currency short-draining path).
  it("closing a fiat/fiat-origin short via another fiat/fiat swap produces no disposal", () => {
    const FIAT3 = new Set(["CZK", "RUB", "EUR"]);
    const rows = [
      // TX1: sell EUR for CZK — no EUR lots exist, creates EUR short (rate=0) + CZK lots
      row("t1", "2024-01-01", "50000", "CZK", "1000", "EUR"),
      // TX2: sell RUB for EUR — no RUB lots exist, creates RUB short (rate=0).
      //   Before creating EUR lots it drains the EUR short (rate=0) silently.
      row("t2", "2024-02-01", "1000", "EUR", "90000", "RUB"),
    ];
    const result = runFifo(rows, FIAT3);
    // No meaningful USDT disposals anywhere
    const allDisposals = Object.values(result.pairs).flatMap((p) => p.disposals);
    expect(allDisposals).toHaveLength(0);
  });
});
