/**
 * Solscan public API — SOL and SPL token transfers (keyless).
 */

const BASE = "https://public-api.solscan.io";

export interface SolTransfer {
  txHash: string;
  blockTime: number;
  src: string;
  dst: string;
  lamport: number;         // SOL transfers: amount in lamports
  changeType?: string;     // SPL: 'inc' | 'dec'
  changeAmount?: number;   // SPL: amount in smallest unit
  tokenAddress?: string;
  symbol?: string;
  decimals?: number;
}

async function fetchPages(endpoint: string, address: string): Promise<SolTransfer[]> {
  const all: SolTransfer[] = [];
  let offset = 0;
  const limit = 50;
  for (let page = 0; page < 200; page++) {
    const url = `${BASE}/${endpoint}?${new URLSearchParams({ account: address, limit: String(limit), offset: String(offset) })}`;
    const res = await fetch(url, { headers: { "User-Agent": "AccPanel/1.0", Accept: "application/json" } });
    if (!res.ok) break;
    const data = await res.json() as { data?: SolTransfer[] };
    const items = data.data ?? [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < limit) break;
    offset += limit;
    await new Promise((r) => setTimeout(r, 400));
  }
  return all;
}

export async function fetchSolTransactions(address: string): Promise<{ sol: SolTransfer[]; spl: SolTransfer[] }> {
  const [sol, spl] = await Promise.all([
    fetchPages("account/solTransfers", address),
    fetchPages("account/splTransfers", address),
  ]);
  return { sol, spl };
}
