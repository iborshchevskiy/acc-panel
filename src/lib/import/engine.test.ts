import { describe, it, expect } from "vitest";
import { mergeByHash } from "./engine";

type Leg = { direction: "in" | "out" | "fee"; amount: string; currency: string };

function tx(hash: string, legs: Leg[]) {
  return {
    tx: {
      txHash: hash,
      chain: "TRON",
      type: "Trade",
      transactionType: "Trade",
      timestamp: new Date("2026-01-01"),
      fromAddress: null,
      toAddress: null,
      location: "addr",
      comment: null,
      raw: {},
    },
    legs,
  };
}

describe("mergeByHash (audit Bug B3 — multi-transfer dedup)", () => {
  it("merges two converted rows sharing a txHash into one with union of legs", () => {
    const rows = [
      tx("hash1", [{ direction: "out", amount: "100", currency: "USDT" }]),
      tx("hash1", [{ direction: "in", amount: "1000", currency: "TRX" }]),
    ];
    const merged = mergeByHash(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].legs).toHaveLength(2);
    expect(merged[0].legs.map((l) => l.currency).sort()).toEqual(["TRX", "USDT"]);
  });

  it("preserves rows with no txHash (manual entries)", () => {
    const rows = [
      tx("hash1", [{ direction: "out", amount: "100", currency: "USDT" }]),
      { ...tx("", [{ direction: "in", amount: "5", currency: "EUR" }]), tx: { ...tx("", []).tx, txHash: "" } },
    ];
    rows[1].tx.txHash = ""; // explicit
    const merged = mergeByHash(rows);
    expect(merged).toHaveLength(2);
  });

  it("dedupes identical fee legs introduced by merge (EVM txlist + tokentx duplicate)", () => {
    // EVM scenario: same hash returned by both endpoints, both producing a fee.
    const rows = [
      tx("0xevm", [
        { direction: "out", amount: "1", currency: "ETH" },
        { direction: "fee", amount: "0.00063", currency: "ETH" },
      ]),
      tx("0xevm", [
        { direction: "out", amount: "100", currency: "USDC" },
        { direction: "fee", amount: "0.00063", currency: "ETH" },
      ]),
    ];
    const merged = mergeByHash(rows);
    expect(merged).toHaveLength(1);
    const fees = merged[0].legs.filter((l) => l.direction === "fee");
    expect(fees).toHaveLength(1); // duplicate dropped
    expect(fees[0]).toEqual({ direction: "fee", amount: "0.00063", currency: "ETH" });
    // Non-fee legs are preserved as-is.
    const nonFees = merged[0].legs.filter((l) => l.direction !== "fee");
    expect(nonFees).toHaveLength(2);
  });

  it("keeps multiple non-identical fee legs (different amounts or currencies)", () => {
    const rows = [
      tx("h", [
        { direction: "fee", amount: "5", currency: "TRX" },
        { direction: "fee", amount: "10", currency: "TRX" },
      ]),
    ];
    const merged = mergeByHash(rows);
    expect(merged[0].legs.filter((l) => l.direction === "fee")).toHaveLength(2);
  });
});
