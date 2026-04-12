/**
 * Converts raw blockchain API data into transaction + leg insert payloads.
 */
import type { TronTx } from "./tron";
import type { EvmTx } from "./evm";
import type { SolTransfer } from "./sol";

export interface TxInsert {
  txHash: string;
  chain: string;
  type: string;
  transactionType: string;
  timestamp: Date;
  fromAddress: string | null;
  toAddress: string | null;
  location: string;
  comment: string | null;
  raw: Record<string, unknown>;
}

export interface LegInsert {
  direction: "in" | "out" | "fee";
  amount: string;
  currency: string;
}

export interface ConvertedTx {
  tx: TxInsert;
  legs: LegInsert[];
}

function isInternal(addr: string, internalAddresses: Set<string>): boolean {
  return internalAddresses.has(addr.toLowerCase());
}

// ── TRON ──────────────────────────────���──────────────────────────────────────

export function convertTronTx(
  raw: TronTx,
  walletAddress: string,
  internalAddresses: Set<string>
): ConvertedTx | null {
  const myAddr = walletAddress.toLowerCase();
  const fromMe = raw.from.toLowerCase() === myAddr;
  const toMe = raw.to.toLowerCase() === myAddr;

  if (!fromMe && !toMe) return null;

  const decimals = raw.token_info?.decimals ?? 6;
  const amount = (parseInt(raw.value, 10) / Math.pow(10, decimals)).toString();
  const symbol = raw.token_info?.symbol ?? "TRX";
  const timestamp = new Date(raw.block_timestamp);

  const bothInternal =
    isInternal(raw.from, internalAddresses) && isInternal(raw.to, internalAddresses);
  const txType = bothInternal ? "Transfer" : "Trade";

  const legs: LegInsert[] = [];

  if (toMe && !fromMe) {
    legs.push({ direction: "in", amount, currency: symbol });
  } else if (fromMe && !toMe) {
    legs.push({ direction: "out", amount, currency: symbol });
  } else {
    // self-transfer
    legs.push({ direction: "out", amount, currency: symbol });
    legs.push({ direction: "in", amount, currency: symbol });
  }

  if (raw.fee_sun && raw.fee_sun > 0) {
    const feeTrx = (raw.fee_sun / 1_000_000).toString();
    legs.push({ direction: "fee", amount: feeTrx, currency: "TRX" });
  }

  return {
    tx: {
      txHash: raw.transaction_id,
      chain: "TRON",
      type: "Trade",
      transactionType: txType,
      timestamp,
      fromAddress: raw.from,
      toAddress: raw.to,
      location: walletAddress,
      comment: null,
      raw: raw as unknown as Record<string, unknown>,
    },
    legs,
  };
}

// ── EVM ────────────────────────────────���──────────────────────────────────────

export function convertEvmTx(
  raw: EvmTx,
  walletAddress: string,
  chain: "ETH" | "BNB",
  internalAddresses: Set<string>
): ConvertedTx | null {
  const myAddr = walletAddress.toLowerCase();
  const fromMe = raw.from.toLowerCase() === myAddr;
  const toMe = raw.to?.toLowerCase() === myAddr;

  if (!fromMe && !toMe) return null;

  const decimals = raw.tokenDecimal ? parseInt(raw.tokenDecimal, 10) : 18;
  const amount = (parseInt(raw.value, 10) / Math.pow(10, decimals)).toString();
  const symbol = raw.tokenSymbol ?? (chain === "ETH" ? "ETH" : "BNB");

  const bothInternal =
    isInternal(raw.from, internalAddresses) && isInternal(raw.to ?? "", internalAddresses);
  const txType = bothInternal ? "Transfer" : "Trade";

  const legs: LegInsert[] = [];
  if (toMe && !fromMe) {
    legs.push({ direction: "in", amount, currency: symbol });
  } else if (fromMe && !toMe) {
    legs.push({ direction: "out", amount, currency: symbol });
  }

  return {
    tx: {
      txHash: raw.hash,
      chain,
      type: "Trade",
      transactionType: txType,
      timestamp: new Date(parseInt(raw.timeStamp, 10) * 1000),
      fromAddress: raw.from,
      toAddress: raw.to ?? null,
      location: walletAddress,
      comment: null,
      raw: raw as unknown as Record<string, unknown>,
    },
    legs,
  };
}

// ── Solana ──────────────────────────────────────────────────────────────��─────

export function convertSolTx(
  raw: SolTransfer,
  walletAddress: string,
  isSpl: boolean,
  internalAddresses: Set<string>
): ConvertedTx | null {
  const myAddr = walletAddress.toLowerCase();
  const fromMe = raw.src?.toLowerCase() === myAddr;
  const toMe = raw.dst?.toLowerCase() === myAddr;

  let direction: "in" | "out";
  if (isSpl && raw.changeType) {
    direction = raw.changeType === "inc" ? "in" : "out";
  } else {
    if (toMe && !fromMe) direction = "in";
    else if (fromMe && !toMe) direction = "out";
    else return null;
  }

  const decimals = isSpl ? (raw.decimals ?? 9) : 9;
  const rawAmount = isSpl ? (raw.changeAmount ?? 0) : raw.lamport;
  const amount = (rawAmount / Math.pow(10, decimals)).toString();
  const symbol = isSpl ? (raw.symbol ?? "SPL") : "SOL";

  const bothInternal =
    raw.src && raw.dst &&
    isInternal(raw.src, internalAddresses) &&
    isInternal(raw.dst, internalAddresses);
  const txType = bothInternal ? "Transfer" : "Trade";

  return {
    tx: {
      txHash: raw.txHash,
      chain: "SOL",
      type: "Trade",
      transactionType: txType,
      timestamp: new Date(raw.blockTime * 1000),
      fromAddress: raw.src ?? null,
      toAddress: raw.dst ?? null,
      location: walletAddress,
      comment: null,
      raw: raw as unknown as Record<string, unknown>,
    },
    legs: [{ direction, amount, currency: symbol }],
  };
}
