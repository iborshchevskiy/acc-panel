/**
 * TronGrid API client — TRC-20 transfers + native TRX transfers.
 * No API key required; set TRONGRID_API_KEY env for higher rate limits.
 */

const BASE_URL = "https://api.trongrid.io";
const LIMIT = 200;
const MIN_TRX_SUN = 100_000; // 0.1 TRX dust filter

function makeHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (process.env.TRONGRID_API_KEY) h["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  return h;
}

async function fetchWithRetry(url: string, retries = 5): Promise<unknown> {
  let backoff = 500;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: makeHeaders() });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 10_000);
    }
  }
  throw lastErr;
}

export interface TronTx {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  token_info: { symbol: string; decimals: number; address?: string };
  fee_sun?: number;
}

export async function fetchTrc20Transactions(address: string): Promise<TronTx[]> {
  const all: TronTx[] = [];
  let fingerprint: string | undefined;

  for (let page = 0; page < 1000; page++) {
    const params = new URLSearchParams({ limit: String(LIMIT), order_by: "block_timestamp,desc" });
    if (fingerprint) params.set("fingerprint", fingerprint);
    const url = `${BASE_URL}/v1/accounts/${address}/transactions/trc20?${params}`;
    const data = await fetchWithRetry(url) as { data?: TronTx[]; meta?: { fingerprint?: string } };
    const items = data.data ?? [];
    if (!items.length) break;
    all.push(...items);
    fingerprint = data.meta?.fingerprint;
    if (!fingerprint) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

function hexToBase58(hex: string): string {
  if (!hex) return "";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const raw = Buffer.from(hex, "hex");
  const checksum = crypto.createHash("sha256")
    .update(crypto.createHash("sha256").update(raw).digest())
    .digest()
    .slice(0, 4);
  const data = Buffer.concat([raw, checksum]);
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  // Base58 encode using byte-level arithmetic (no BigInt needed)
  const digits = [0];
  for (const byte of data) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = "";
  for (let i = 0; i < data.length && data[i] === 0; i++) encoded += "1";
  for (let i = digits.length - 1; i >= 0; i--) encoded += ALPHABET[digits[i]];
  return encoded;
}

export async function fetchTrxTransfers(address: string): Promise<TronTx[]> {
  const all: TronTx[] = [];
  let fingerprint: string | undefined;

  for (let page = 0; page < 1000; page++) {
    const params = new URLSearchParams({
      limit: String(LIMIT),
      order_by: "block_timestamp,desc",
      only_confirmed: "true",
    });
    if (fingerprint) params.set("fingerprint", fingerprint);
    const url = `${BASE_URL}/v1/accounts/${address}/transactions?${params}`;
    const data = await fetchWithRetry(url) as {
      data?: Array<{
        txID: string;
        block_timestamp: number;
        ret?: Array<{ fee?: number }>;
        raw_data?: { contract?: Array<{ type: string; parameter?: { value?: { amount?: number; owner_address?: string; to_address?: string } } }> };
      }>;
      meta?: { fingerprint?: string };
    };
    const items = data.data ?? [];
    if (!items.length) break;

    for (const tx of items) {
      const contracts = tx.raw_data?.contract ?? [];
      const contract = contracts[0];
      if (contract?.type !== "TransferContract") continue;
      const v = contract.parameter?.value ?? {};
      const amount = v.amount ?? 0;
      const owner = v.owner_address ?? "";
      const recipient = v.to_address ?? "";
      if (!amount || !owner || !recipient) continue;
      if (amount < MIN_TRX_SUN) continue;

      const feeSun = tx.ret?.[0]?.fee ?? 0;
      all.push({
        transaction_id: tx.txID,
        block_timestamp: tx.block_timestamp,
        from: hexToBase58(owner),
        to: hexToBase58(recipient),
        value: String(amount),
        token_info: { symbol: "TRX", decimals: 6 },
        fee_sun: feeSun,
      });
    }

    fingerprint = data.meta?.fingerprint;
    if (!fingerprint) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}
