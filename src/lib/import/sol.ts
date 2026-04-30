/**
 * Helius API — SOL and SPL token transfers.
 * Free tier: https://dev.helius.xyz  (100k credits/month, no CC required)
 * Set HELIUS_API_KEY in environment.
 */

const HELIUS_BASE = "https://api.helius.xyz/v0";

// Well-known SPL mint → ticker (augmented at runtime from token metadata)
const KNOWN_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So:  "mSOL",
  So11111111111111111111111111111111111111112:    "wSOL",
};

export interface SolTransfer {
  txHash: string;
  blockTime: number;
  src: string;
  dst: string;
  /** For native SOL transfers: amount in lamports */
  lamport: number;
  /** For SPL: 'inc' | 'dec' from the perspective of the queried address */
  changeType?: string;
  changeAmount?: number;
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
  /** Per-tx Helius fee (lamports) — only set on the canonical row to avoid
   * double-counting when one tx has both SOL and SPL transfers. */
  feeLamports?: number;
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  fee?: number;     // lamports — paid by the tx fee payer
  feePayer?: string;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard?: string;
  }>;
}

async function fetchHeliusPage(address: string, before?: string): Promise<HeliusTx[]> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("HELIUS_API_KEY is not set. Get a free key at https://dev.helius.xyz");

  const params = new URLSearchParams({
    "api-key": key,
    limit: "100",
  });
  if (before) params.set("before", before);

  const url = `${HELIUS_BASE}/addresses/${address}/transactions?${params}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (res.status === 401) throw new Error("Invalid HELIUS_API_KEY");
  if (!res.ok) throw new Error(`Helius API error: ${res.status} ${res.statusText}`);

  const data = await res.json() as HeliusTx[];
  return Array.isArray(data) ? data : [];
}

export async function fetchSolTransactions(
  address: string
): Promise<{ sol: SolTransfer[]; spl: SolTransfer[] }> {
  const addr = address.toLowerCase();
  const sol: SolTransfer[] = [];
  const spl: SolTransfer[] = [];
  const seen = new Set<string>();

  let before: string | undefined;

  for (let page = 0; page < 100; page++) {
    const txs = await fetchHeliusPage(address, before);
    if (!txs.length) break;

    for (const tx of txs) {
      if (seen.has(tx.signature)) continue;
      seen.add(tx.signature);

      // Attach the per-tx Helius fee to the FIRST emitted transfer for this
      // signature so the converter can emit a single fee leg (avoids
      // double-counting when one signature produces both SOL + SPL rows).
      // Only attach if we paid the fee.
      const feePayerLow = tx.feePayer?.toLowerCase();
      const weArePayer = feePayerLow === addr;
      const feeForThisTx = weArePayer && tx.fee && tx.fee > 0 ? tx.fee : undefined;
      let feeAttached = false;

      // Native SOL transfers
      for (const t of tx.nativeTransfers ?? []) {
        if (t.amount <= 0) continue;
        const fromLow = t.fromUserAccount.toLowerCase();
        const toLow   = t.toUserAccount.toLowerCase();
        if (fromLow !== addr && toLow !== addr) continue;
        const row: SolTransfer = {
          txHash:    tx.signature,
          blockTime: tx.timestamp,
          src:       t.fromUserAccount,
          dst:       t.toUserAccount,
          lamport:   t.amount,
        };
        if (feeForThisTx && !feeAttached) {
          row.feeLamports = feeForThisTx;
          feeAttached = true;
        }
        sol.push(row);
      }

      // SPL token transfers
      for (const t of tx.tokenTransfers ?? []) {
        if ((t.tokenAmount ?? 0) <= 0) continue;
        const fromLow = t.fromUserAccount.toLowerCase();
        const toLow   = t.toUserAccount.toLowerCase();
        if (fromLow !== addr && toLow !== addr) continue;

        const symbol = KNOWN_MINTS[t.mint] ?? t.mint.slice(0, 6);
        const isIncoming = toLow === addr;

        const row: SolTransfer = {
          txHash:       tx.signature,
          blockTime:    tx.timestamp,
          src:          t.fromUserAccount,
          dst:          t.toUserAccount,
          lamport:      0,
          changeType:   isIncoming ? "inc" : "dec",
          changeAmount: t.tokenAmount,
          tokenAddress: t.mint,
          symbol,
          decimals:     0, // Helius already returns human-readable amounts
        };
        if (feeForThisTx && !feeAttached) {
          row.feeLamports = feeForThisTx;
          feeAttached = true;
        }
        spl.push(row);
      }
    }

    if (txs.length < 100) break;
    before = txs[txs.length - 1].signature;
    await new Promise((r) => setTimeout(r, 200));
  }

  return { sol, spl };
}
