/**
 * Import engine — orchestrates fetching, converting, and persisting transactions.
 * Called from API routes. Updates import_targets.sync_status throughout.
 */
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets, importTargets } from "@/db/schema/wallets";
import { eq, and } from "drizzle-orm";
import { ensureCurrencies } from "@/lib/currencies";
import { fetchTrc20Transactions, fetchTrxTransfers } from "./tron";
import { fetchEvmNormalTxs, fetchErc20Transfers } from "./evm";
import { fetchSolTransactions } from "./sol";
import { convertTronTx, convertEvmTx, convertSolTx } from "./converter";

type ConvertedTx = ReturnType<typeof convertTronTx>;

async function getInternalAddresses(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.organizationId, orgId), eq(wallets.isActive, true)));
  return new Set(rows.map((r) => r.address.toLowerCase()));
}

async function getExistingHashes(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ txHash: transactions.txHash })
    .from(transactions)
    .where(eq(transactions.organizationId, orgId));
  return new Set(rows.map((r) => r.txHash).filter(Boolean) as string[]);
}

async function insertTransaction(
  orgId: string,
  converted: ConvertedTx,
  walletId: string
): Promise<void> {
  if (!converted) return;
  const { tx, legs } = converted;

  const [inserted] = await db
    .insert(transactions)
    .values({ ...tx, organizationId: orgId, isMatched: false })
    .returning({ id: transactions.id });

  if (legs.length > 0) {
    await db.insert(transactionLegs).values(
      legs.map((leg) => ({
        transactionId: inserted.id,
        direction: leg.direction,
        amount: leg.amount,
        currency: leg.currency,
        walletId,
      }))
    );
  }

  const legCodes = legs.map((l) => l.currency).filter(Boolean);
  if (legCodes.length > 0) await ensureCurrencies(orgId, legCodes);
}

export async function runImport(walletId: string, orgId: string): Promise<{ inserted: number; skipped: number }> {
  await db
    .update(importTargets)
    .set({ syncStatus: "running", lastError: null, updatedAt: new Date() })
    .where(eq(importTargets.walletId, walletId));

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.organizationId, orgId)));

  if (!wallet) {
    await db
      .update(importTargets)
      .set({ syncStatus: "error", lastError: "Wallet not found", updatedAt: new Date() })
      .where(eq(importTargets.walletId, walletId));
    return { inserted: 0, skipped: 0 };
  }

  const [internalAddresses, existingHashes] = await Promise.all([
    getInternalAddresses(orgId),
    getExistingHashes(orgId),
  ]);

  let inserted = 0;
  let skipped = 0;

  try {
    let convertedTxs: Array<ConvertedTx> = [];

    if (wallet.chain === "TRON") {
      const [trc20, trx] = await Promise.all([
        fetchTrc20Transactions(wallet.address),
        fetchTrxTransfers(wallet.address),
      ]);
      convertedTxs = [...trc20, ...trx].map((raw) =>
        convertTronTx(raw, wallet.address, internalAddresses)
      );
    } else if (wallet.chain === "ETH" || wallet.chain === "BNB") {
      const chain = wallet.chain as "ETH" | "BNB";
      const [normal, erc20] = await Promise.all([
        fetchEvmNormalTxs(wallet.address, chain),
        fetchErc20Transfers(wallet.address, chain),
      ]);
      convertedTxs = [...normal, ...erc20].map((raw) =>
        convertEvmTx(raw, wallet.address, chain, internalAddresses)
      );
    } else if (wallet.chain === "SOL") {
      const { sol, spl } = await fetchSolTransactions(wallet.address);
      convertedTxs = [
        ...sol.map((raw) => convertSolTx(raw, wallet.address, false, internalAddresses)),
        ...spl.map((raw) => convertSolTx(raw, wallet.address, true, internalAddresses)),
      ];
    }

    for (const converted of convertedTxs) {
      if (!converted) { skipped++; continue; }
      if (converted.tx.txHash && existingHashes.has(converted.tx.txHash)) {
        skipped++;
        continue;
      }
      await insertTransaction(orgId, converted, walletId);
      if (converted.tx.txHash) existingHashes.add(converted.tx.txHash);
      inserted++;
    }

    const txCountRow = await db
      .select({ count: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.organizationId, orgId), eq(transactions.location, wallet.address)));

    await db
      .update(importTargets)
      .set({
        syncStatus: "done",
        lastSyncAt: new Date(),
        txCount: txCountRow.length,
        updatedAt: new Date(),
      })
      .where(eq(importTargets.walletId, walletId));
  } catch (err) {
    await db
      .update(importTargets)
      .set({
        syncStatus: "error",
        lastError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(importTargets.walletId, walletId));
  }

  return { inserted, skipped };
}
