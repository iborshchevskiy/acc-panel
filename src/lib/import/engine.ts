/**
 * Import engine — orchestrates fetching, converting, and persisting transactions.
 * Called from API routes. Updates import_targets.sync_status throughout.
 */
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets, importTargets } from "@/db/schema/wallets";
import { eq, and, isNull, sql } from "drizzle-orm";
import { ensureCurrencies } from "@/lib/currencies";
import { fetchTrc20Transactions, fetchTrxTransfers } from "./tron";
import { fetchEvmNormalTxs, fetchErc20Transfers } from "./evm";
import { fetchSolTransactions } from "./sol";
import { convertTronTx, convertEvmTx, convertSolTx } from "./converter";

type ConvertedTx = NonNullable<ReturnType<typeof convertTronTx>>;

/**
 * Merge converted txs that share a `txHash` into a single tx with the union
 * of legs. A single chain tx can emit multiple transfer events (DEX swaps,
 * batched payouts, TRC-20 transfer + TRX fee in one signature). The previous
 * importer dedup-by-hash kept only the first row and silently dropped the
 * rest — wrong cost basis for any non-trivial chain activity (audit Bug B3).
 *
 * Manual rows (no txHash) pass through unmerged.
 */
export function mergeByHash(rows: ConvertedTx[]): ConvertedTx[] {
  const byHash = new Map<string, ConvertedTx>();
  const noHash: ConvertedTx[] = [];
  for (const c of rows) {
    if (!c.tx.txHash) { noHash.push(c); continue; }
    const ex = byHash.get(c.tx.txHash);
    if (ex) {
      ex.legs.push(...c.legs);
      ex.tx.raw = { ...ex.tx.raw, [`merge_${ex.legs.length}`]: c.tx.raw };
    } else {
      byHash.set(c.tx.txHash, c);
    }
  }
  // Dedupe identical fee legs introduced by the merge. EVM's txlist and
  // tokentx endpoints return the same hash with the same gasUsed × gasPrice;
  // each call to convertEvmTx emits a fee leg so naive merge double-counts.
  // Keys: direction|currency|amount — only exact duplicates are dropped.
  for (const c of byHash.values()) {
    const seen = new Set<string>();
    c.legs = c.legs.filter((l) => {
      if (l.direction !== "fee") return true;
      const key = `${l.direction}|${l.currency}|${l.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return [...byHash.values(), ...noHash];
}

async function getInternalAddresses(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.organizationId, orgId), eq(wallets.isActive, true)));
  return new Set(rows.map((r) => r.address.toLowerCase()));
}

async function getExistingHashes(orgId: string): Promise<Set<string>> {
  // Only count non-deleted transactions — soft-deleted ones can be re-imported
  const rows = await db
    .select({ txHash: transactions.txHash })
    .from(transactions)
    .where(and(eq(transactions.organizationId, orgId), isNull(transactions.deletedAt)));
  return new Set(rows.map((r) => r.txHash).filter(Boolean) as string[]);
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
    let rawConverted: Array<ConvertedTx | null> = [];

    if (wallet.chain === "TRON") {
      const [trc20, trx] = await Promise.all([
        fetchTrc20Transactions(wallet.address),
        fetchTrxTransfers(wallet.address),
      ]);
      rawConverted = [...trc20, ...trx].map((raw) =>
        convertTronTx(raw, wallet.address, internalAddresses)
      );
    } else if (wallet.chain === "ETH" || wallet.chain === "BNB") {
      const chain = wallet.chain as "ETH" | "BNB";
      const [normal, erc20] = await Promise.all([
        fetchEvmNormalTxs(wallet.address, chain),
        fetchErc20Transfers(wallet.address, chain),
      ]);
      rawConverted = [...normal, ...erc20].map((raw) =>
        convertEvmTx(raw, wallet.address, chain, internalAddresses)
      );
    } else if (wallet.chain === "SOL") {
      const { sol, spl } = await fetchSolTransactions(wallet.address);
      rawConverted = [
        ...sol.map((raw) => convertSolTx(raw, wallet.address, false, internalAddresses)),
        ...spl.map((raw) => convertSolTx(raw, wallet.address, true, internalAddresses)),
      ];
    }

    // Drop nulls then merge multiple transfer events of the same tx hash into
    // a single tx with the union of legs (audit Bug B3).
    const merged = mergeByHash(rawConverted.filter((c): c is ConvertedTx => c !== null));

    // Dedup against already-present (live) txs.
    const newTxs: ConvertedTx[] = [];
    for (const c of merged) {
      if (c.tx.txHash && existingHashes.has(c.tx.txHash)) { skipped++; continue; }
      newTxs.push(c);
    }
    inserted = newTxs.length;

    if (newTxs.length > 0) {
      // Wrap tx + legs in a single transaction so a leg-insert failure rolls
      // the tx-insert back (audit Bug B9 — without this, concurrent imports
      // produced orphan txs with no legs that FIFO silently treated as valid).
      //
      // Race safety (audit Bug B2): two wallets owned by the same org could
      // race their imports of the same chain tx. Snapshot-then-insert leaves
      // a window where both see "no existing hash" and both insert. We avoid
      // it with a per-org advisory lock that serialises overlapping imports
      // for the same organisation. Cost: minimal — locks are released at
      // commit, no contention with cross-org imports.
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`);

        // Re-fetch hashes inside the lock so the dedup is race-free.
        const liveHashRows = await tx
          .select({ txHash: transactions.txHash })
          .from(transactions)
          .where(and(eq(transactions.organizationId, orgId), isNull(transactions.deletedAt)));
        const liveHashes = new Set(liveHashRows.map((r) => r.txHash).filter(Boolean) as string[]);

        const trulyNew = newTxs.filter((c) => !c.tx.txHash || !liveHashes.has(c.tx.txHash));
        const racedSkips = newTxs.length - trulyNew.length;
        if (racedSkips > 0) skipped += racedSkips;
        if (trulyNew.length === 0) { inserted = 0; return; }

        const insertedTxs = await tx
          .insert(transactions)
          .values(trulyNew.map((c) => ({ ...c.tx, organizationId: orgId, isMatched: false })))
          .returning({ id: transactions.id });

        const allLegs = trulyNew.flatMap((c, i) =>
          c.legs.map((leg) => ({
            transactionId: insertedTxs[i].id,
            direction: leg.direction,
            amount: leg.amount,
            currency: leg.currency,
            walletId,
          }))
        );
        if (allLegs.length > 0) {
          await tx.insert(transactionLegs).values(allLegs);
        }
        inserted = trulyNew.length;
      });

      const allCurrencies = newTxs.flatMap((c) => c.legs.map((l) => l.currency)).filter(Boolean);
      if (allCurrencies.length > 0) await ensureCurrencies(orgId, allCurrencies);
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
