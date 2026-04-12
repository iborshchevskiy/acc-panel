/**
 * Import engine — orchestrates fetching, converting, and persisting transactions.
 * Called from API routes. Updates import_targets.sync_status throughout.
 */
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets, importTargets } from "@/db/schema/wallets";
import { eq, and } from "drizzle-orm";
import { fetchTrc20Transactions, fetchTrxTransfers } from "./tron";
import { fetchEvmNormalTxs, fetchErc20Transfers } from "./evm";
import { fetchSolTransactions } from "./sol";
import { convertTronTx, convertEvmTx, convertSolTx } from "./converter";

async function getInternalAddresses(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.organizationId, orgId), eq(wallets.isActive, true)));
  return new Set(rows.map((r) => r.address.toLowerCase()));
}

async function upsertTransaction(
  orgId: string,
  converted: ReturnType<typeof convertTronTx>,
  walletId: string
): Promise<"inserted" | "skipped"> {
  if (!converted) return "skipped";
  const { tx, legs } = converted;

  // Idempotency check
  const existing = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.txHash, tx.txHash), eq(transactions.organizationId, orgId)))
    .limit(1);
  if (existing.length > 0) return "skipped";

  const [inserted] = await db
    .insert(transactions)
    .values({ ...tx, organizationId: orgId, isMatched: false })
    .returning({ id: transactions.id });

  for (const leg of legs) {
    await db.insert(transactionLegs).values({
      transactionId: inserted.id,
      direction: leg.direction,
      amount: leg.amount,
      currency: leg.currency,
      walletId,
    });
  }

  return "inserted";
}

export async function runImport(walletId: string, orgId: string): Promise<{ inserted: number; skipped: number }> {
  // Mark as running
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

  const internalAddresses = await getInternalAddresses(orgId);
  let inserted = 0;
  let skipped = 0;

  try {
    if (wallet.chain === "TRON") {
      const [trc20, trx] = await Promise.all([
        fetchTrc20Transactions(wallet.address),
        fetchTrxTransfers(wallet.address),
      ]);

      for (const raw of [...trc20, ...trx]) {
        const converted = convertTronTx(raw, wallet.address, internalAddresses);
        const result = await upsertTransaction(orgId, converted, walletId);
        if (result === "inserted") inserted++; else skipped++;
      }
    } else if (wallet.chain === "ETH" || wallet.chain === "BNB") {
      const chain = wallet.chain as "ETH" | "BNB";
      const [normal, erc20] = await Promise.all([
        fetchEvmNormalTxs(wallet.address, chain),
        fetchErc20Transfers(wallet.address, chain),
      ]);

      for (const raw of [...normal, ...erc20]) {
        const converted = convertEvmTx(raw, wallet.address, chain, internalAddresses);
        const result = await upsertTransaction(orgId, converted, walletId);
        if (result === "inserted") inserted++; else skipped++;
      }
    } else if (wallet.chain === "SOL") {
      const { sol, spl } = await fetchSolTransactions(wallet.address);

      for (const raw of sol) {
        const converted = convertSolTx(raw, wallet.address, false, internalAddresses);
        const result = await upsertTransaction(orgId, converted, walletId);
        if (result === "inserted") inserted++; else skipped++;
      }
      for (const raw of spl) {
        const converted = convertSolTx(raw, wallet.address, true, internalAddresses);
        const result = await upsertTransaction(orgId, converted, walletId);
        if (result === "inserted") inserted++; else skipped++;
      }
    }

    // Update tx count on wallet
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
