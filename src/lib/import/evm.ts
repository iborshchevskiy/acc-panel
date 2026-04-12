/**
 * Blockscout API client — ETH and BNB Chain transfers (keyless).
 */

const CHAIN_URLS: Record<string, string> = {
  ETH: "https://eth.blockscout.com/api",
  BNB: "https://bsc.blockscout.com/api",
};

export interface EvmTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;             // native amount in wei
  tokenSymbol?: string;      // ERC-20 transfers
  tokenDecimal?: string;
  isError?: string;
}

async function fetchPage(baseUrl: string, params: Record<string, string>): Promise<EvmTx[]> {
  const url = `${baseUrl}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "User-Agent": "AccPanel/1.0" } });
  if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
  const data = await res.json() as { result?: EvmTx[] | string };
  const result = data.result;
  if (!Array.isArray(result)) return [];
  return result;
}

async function fetchAll(baseUrl: string, action: string, address: string): Promise<EvmTx[]> {
  const all: EvmTx[] = [];
  let page = 1;
  while (true) {
    const items = await fetchPage(baseUrl, {
      module: "account", action,
      address, startblock: "0", endblock: "99999999",
      page: String(page), offset: "1000", sort: "desc",
    });
    if (!items.length) break;
    all.push(...items);
    if (items.length < 1000) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

export async function fetchEvmNormalTxs(address: string, chain: "ETH" | "BNB"): Promise<EvmTx[]> {
  const url = CHAIN_URLS[chain];
  const txs = await fetchAll(url, "txlist", address);
  return txs.filter((tx) => tx.isError !== "1");
}

export async function fetchErc20Transfers(address: string, chain: "ETH" | "BNB"): Promise<EvmTx[]> {
  return fetchAll(CHAIN_URLS[chain], "tokentx", address);
}
