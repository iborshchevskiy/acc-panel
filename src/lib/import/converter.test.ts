import { describe, it, expect } from "vitest";
import { convertTronTx, convertEvmTx, convertSolTx } from "./converter";
import type { TronTx } from "./tron";
import type { EvmTx } from "./evm";
import type { SolTransfer } from "./sol";

const myAddr = "0xabcdef1234567890abcdef1234567890abcdef12";
const otherAddr = "0x1111111111111111111111111111111111111111";
const internalEmpty = new Set<string>();

function tron(over: Partial<TronTx> = {}): TronTx {
  return {
    transaction_id: "tron-tx-1",
    block_timestamp: 1700000000000,
    from: otherAddr,
    to: myAddr,
    value: "20500000",
    token_info: { symbol: "USDT", decimals: 6, address: "" },
    fee_sun: 0,
    ...over,
  } as TronTx;
}

function evm(over: Partial<EvmTx> = {}): EvmTx {
  return {
    hash: "0xevmhash",
    timeStamp: "1700000000",
    from: myAddr,
    to: otherAddr,
    value: "0",
    ...over,
  };
}

function solRaw(over: Partial<SolTransfer> = {}): SolTransfer {
  return {
    txHash: "sol-tx",
    blockTime: 1700000000,
    src: otherAddr,
    dst: myAddr,
    lamport: 0,
    ...over,
  };
}

describe("convertTronTx (audit Bug B1 — BigInt amount conversion)", () => {
  it("preserves precision for amounts past Number.MAX_SAFE_INTEGER", () => {
    // Edge case: very large TRC-20 transfer. parseInt would round.
    const c = convertTronTx(tron({ value: "987654321098765432", token_info: { symbol: "USDT", decimals: 6, address: "" } }), myAddr, internalEmpty)!;
    const inLeg = c.legs.find((l) => l.direction === "in")!;
    // BigInt result: 987654321098765432 / 10^6 = 987654321098.765432.
    // parseInt would round the input to 987654321098765400 → 987654321098.7654 (last digits lost).
    expect(inLeg.amount).toBe("987654321098.765432");
  });

  it("converts standard 20.5 USDT transfer correctly", () => {
    const c = convertTronTx(tron(), myAddr, internalEmpty)!;
    expect(c.legs[0]).toEqual({ direction: "in", amount: "20.5", currency: "USDT" });
  });

  it("emits a fee leg in TRX when fee_sun is set", () => {
    const c = convertTronTx(tron({ fee_sun: 5_000_000 }), myAddr, internalEmpty)!;
    const fee = c.legs.find((l) => l.direction === "fee");
    expect(fee).toEqual({ direction: "fee", amount: "5", currency: "TRX" });
  });
});

describe("convertEvmTx (audit Bug B1 + B4 — BigInt + gas fee)", () => {
  it("converts 0.123456789012345678 ETH (18 decimals) without precision loss", () => {
    const c = convertEvmTx(
      evm({ from: myAddr, to: otherAddr, value: "123456789012345678" }),
      myAddr, "ETH", internalEmpty
    )!;
    const out = c.legs.find((l) => l.direction === "out")!;
    expect(out.amount).toBe("0.123456789012345678");
  });

  it("emits gas fee leg in native currency when sender is us", () => {
    const c = convertEvmTx(
      evm({ from: myAddr, to: otherAddr, value: "1000000000000000000", gasUsed: "21000", gasPrice: "30000000000" }),
      myAddr, "ETH", internalEmpty
    )!;
    const fee = c.legs.find((l) => l.direction === "fee");
    // 21000 × 30 gwei = 630000000000000 wei = 0.00063 ETH
    expect(fee).toEqual({ direction: "fee", amount: "0.00063", currency: "ETH" });
  });

  it("does NOT emit gas fee leg when we are recipient (sender paid gas)", () => {
    const c = convertEvmTx(
      evm({ from: otherAddr, to: myAddr, value: "1000000000000000000", gasUsed: "21000", gasPrice: "30000000000" }),
      myAddr, "ETH", internalEmpty
    )!;
    expect(c.legs.find((l) => l.direction === "fee")).toBeUndefined();
  });

  it("uses BNB as gas currency on BSC", () => {
    const c = convertEvmTx(
      evm({ from: myAddr, to: otherAddr, value: "1000000000000000000", gasUsed: "21000", gasPrice: "5000000000" }),
      myAddr, "BNB", internalEmpty
    )!;
    const fee = c.legs.find((l) => l.direction === "fee");
    expect(fee?.currency).toBe("BNB");
  });
});

describe("convertSolTx (audit Bug B1 + B4)", () => {
  it("converts native SOL lamports without precision loss", () => {
    const c = convertSolTx(
      solRaw({ src: otherAddr, dst: myAddr, lamport: 1234567890 }),
      myAddr, false, internalEmpty
    )!;
    expect(c.legs[0]).toEqual({ direction: "in", amount: "1.23456789", currency: "SOL" });
  });

  it("emits Helius fee leg when feeLamports attached", () => {
    const c = convertSolTx(
      solRaw({ src: myAddr, dst: otherAddr, lamport: 1000000000, feeLamports: 5000 }),
      myAddr, false, internalEmpty
    )!;
    const fee = c.legs.find((l) => l.direction === "fee");
    // 5000 lamports / 1e9 = 0.000005 SOL
    expect(fee).toEqual({ direction: "fee", amount: "0.000005", currency: "SOL" });
  });

  it("SPL token amount uses Helius human-readable directly", () => {
    const c = convertSolTx(
      solRaw({ src: otherAddr, dst: myAddr, lamport: 0, changeType: "inc", changeAmount: 100.25, symbol: "USDC", decimals: 0 }),
      myAddr, true, internalEmpty
    )!;
    expect(c.legs[0]).toEqual({ direction: "in", amount: "100.25", currency: "USDC" });
  });
});
