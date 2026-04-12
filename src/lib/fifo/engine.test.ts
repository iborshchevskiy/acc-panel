import { describe, it, expect } from "vitest";
import { runFifo, type FifoTxRow } from "./engine";

const FIAT = new Set(["USD", "EUR"]);

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
    const rows = [row("t1", "2024-01-01", "1", "BTC", "40000", "USD")];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["BTC/USD"];
    expect(pair).toBeDefined();
    expect(pair.totalAcquired).toBeCloseTo(1);
    expect(pair.currentHolding).toBeCloseTo(1);
    expect(pair.lots).toHaveLength(1);
    expect(pair.lots[0].costRate).toBeCloseTo(40000);
    expect(pair.disposals).toHaveLength(0);
    expect(pair.totalRealizedGain).toBe(0);
  });

  it("records a simple sell and computes gain", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "BTC", "40000", "USD"),
      row("t2", "2024-06-01", "50000", "USD", "1", "BTC"),
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["BTC/USD"];
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].gain).toBeCloseTo(10000); // 50000 - 40000
    expect(pair.disposals[0].gainCurrency).toBe("USD");
    expect(pair.totalRealizedGain).toBeCloseTo(10000);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("correctly applies FIFO ordering across multiple lots", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "BTC", "30000", "USD"), // lot1: 1 BTC @ 30000
      row("t2", "2024-02-01", "1", "BTC", "40000", "USD"), // lot2: 1 BTC @ 40000
      row("t3", "2024-06-01", "60000", "USD", "1", "BTC"), // sell 1 BTC @ 60000
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["BTC/USD"];
    // Should consume lot1 first (FIFO): gain = (60000 - 30000) * 1 = 30000
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].costRate).toBeCloseTo(30000);
    expect(pair.disposals[0].gain).toBeCloseTo(30000);
    // lot2 should remain
    expect(pair.currentHolding).toBeCloseTo(1);
    expect(pair.lots).toHaveLength(1);
    expect(pair.lots[0].costRate).toBeCloseTo(40000);
  });

  it("splits a lot correctly when selling partial", () => {
    const rows = [
      row("t1", "2024-01-01", "2", "ETH", "2000", "USD"), // 2 ETH @ 1000 each
      row("t2", "2024-06-01", "1500", "USD", "1", "ETH"), // sell 1 ETH @ 1500
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["ETH/USD"];
    expect(pair.disposals[0].amount).toBeCloseTo(1);
    expect(pair.disposals[0].gain).toBeCloseTo(500); // (1500 - 1000) * 1
    expect(pair.currentHolding).toBeCloseTo(1);
    expect(pair.lots[0].remainingAmount).toBeCloseTo(1);
  });

  it("handles sell spanning multiple lots", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "ETH", "1000", "USD"), // lot1: 1 ETH @ 1000
      row("t2", "2024-02-01", "1", "ETH", "2000", "USD"), // lot2: 1 ETH @ 2000
      row("t3", "2024-06-01", "6000", "USD", "2", "ETH"), // sell 2 ETH @ 3000 each
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["ETH/USD"];
    // 2 disposals: one from each lot
    expect(pair.disposals).toHaveLength(2);
    const totalGain = pair.disposals.reduce((s, d) => s + d.gain, 0);
    // lot1: (3000 - 1000) * 1 = 2000; lot2: (3000 - 2000) * 1 = 1000; total = 3000
    expect(totalGain).toBeCloseTo(3000);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("handles short sell (no lots) with zero cost basis", () => {
    const rows = [row("t1", "2024-01-01", "50000", "USD", "1", "BTC")];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["BTC/USD"];
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].costRate).toBe(0);
    expect(pair.disposals[0].gain).toBeCloseTo(50000);
    expect(pair.disposals[0].lotAcquiredAt).toBeNull();
  });

  it("ignores non-Exchange transactions", () => {
    const rows = [
      {
        id: "t1",
        timestamp: new Date("2024-01-01"),
        transactionType: "Revenue",
        incomeAmount: "1000",
        incomeCurrency: "USD",
        outcomeAmount: null,
        outcomeCurrency: null,
      },
    ];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("ignores crypto-to-crypto swaps (both legs non-fiat)", () => {
    const rows = [row("t1", "2024-01-01", "10", "ETH", "0.5", "BTC")];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("ignores fiat-to-fiat swaps", () => {
    const rows = [row("t1", "2024-01-01", "1000", "EUR", "1080", "USD")];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("handles multiple currency pairs independently", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "BTC", "40000", "USD"),
      row("t2", "2024-01-02", "10", "ETH", "20000", "USD"),
      row("t3", "2024-06-01", "50000", "USD", "1", "BTC"),
    ];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(2);
    expect(result.pairs["BTC/USD"].totalRealizedGain).toBeCloseTo(10000);
    expect(result.pairs["ETH/USD"].totalRealizedGain).toBe(0);
    expect(result.pairs["ETH/USD"].currentHolding).toBeCloseTo(10);
  });

  it("summary orders by absolute realized gain descending", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "BTC", "10000", "USD"),
      row("t2", "2024-01-01", "100", "ETH", "100000", "USD"),
      row("t3", "2024-06-01", "20000", "USD", "1", "BTC"),   // BTC gain: 10000
      row("t4", "2024-06-01", "200000", "USD", "100", "ETH"), // ETH gain: 100000
    ];
    const result = runFifo(rows, FIAT);
    expect(result.summary[0].pair).toBe("ETH/USD");
    expect(result.summary[1].pair).toBe("BTC/USD");
  });

  it("avgCost reflects weighted average of remaining lots", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "BTC", "10000", "USD"), // 1 BTC @ 10000
      row("t2", "2024-02-01", "3", "BTC", "30000", "USD"), // 3 BTC @ 10000
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["BTC/USD"];
    expect(pair.currentHolding).toBeCloseTo(4);
    // Both lots at same rate so avg = 10000
    expect(pair.avgCost).toBeCloseTo(10000);
  });

  it("avgCost is null when holding is zero", () => {
    const rows = [
      row("t1", "2024-01-01", "1", "BTC", "40000", "USD"),
      row("t2", "2024-06-01", "50000", "USD", "1", "BTC"),
    ];
    const result = runFifo(rows, FIAT);
    expect(result.pairs["BTC/USD"].avgCost).toBeNull();
  });
});
