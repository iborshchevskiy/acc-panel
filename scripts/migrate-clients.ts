/**
 * Migrate clients.json + tx_clients.json + tx_matched.json → DB
 * Run: ORG_ID=<uuid> npx tsx scripts/migrate-clients.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clients, clientWallets, transactionClients } from "../src/db/schema/clients";
import { transactions } from "../src/db/schema/transactions";
import { eq, and } from "drizzle-orm";

const V1 = resolve(__dirname, "../../acc_prog");

interface V1Client {
  id: string;
  name: string;
  surname?: string;
  tg_username?: string;
  tg_id?: string;
  wallets?: string[];
  note?: string;
  created_at?: string;
}

async function main() {
  const orgId = process.argv[2] || process.env.ORG_ID;
  if (!orgId) { console.error("Usage: ORG_ID=<uuid> npx tsx scripts/migrate-clients.ts"); process.exit(1); }

  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  // ── 1. Migrate clients ────────────────────────────────────────────────────
  const v1Clients: V1Client[] = JSON.parse(readFileSync(`${V1}/clients.json`, "utf8"));
  const v1IdToUuid = new Map<string, string>();

  let clientsInserted = 0, clientsSkipped = 0;
  for (const c of v1Clients) {
    const existing = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.organizationId, orgId), eq(clients.v1Id, c.id))).limit(1);

    if (existing.length > 0) {
      v1IdToUuid.set(c.id, existing[0].id);
      clientsSkipped++;
      continue;
    }

    const [inserted] = await db.insert(clients).values({
      organizationId: orgId,
      v1Id: c.id,
      name: c.name,
      surname: c.surname && c.surname !== "n/a" ? c.surname : null,
      tgUsername: c.tg_username || null,
      tgId: c.tg_id || null,
      note: c.note || null,
      createdAt: c.created_at ? new Date(c.created_at) : new Date(),
    }).returning({ id: clients.id });

    v1IdToUuid.set(c.id, inserted.id);

    // Link counterparty wallets
    for (const addr of (c.wallets ?? [])) {
      await db.insert(clientWallets).values({ clientId: inserted.id, address: addr, chain: "TRON" });
    }

    console.log(`  + ${c.name} ${c.surname ?? ""} (${c.wallets?.length ?? 0} wallets)`);
    clientsInserted++;
  }
  console.log(`Clients: ${clientsInserted} inserted, ${clientsSkipped} skipped\n`);

  // ── 2. Migrate tx_clients.json ────────────────────────────────────────────
  const txClientsPath = `${V1}/tx_clients.json`;
  if (existsSync(txClientsPath)) {
    const txClientsRaw: Record<string, string | null> = JSON.parse(readFileSync(txClientsPath, "utf8"));
    let txClientInserted = 0;
    for (const [txHash, v1ClientId] of Object.entries(txClientsRaw)) {
      const [tx] = await db.select({ id: transactions.id }).from(transactions)
        .where(and(eq(transactions.txHash, txHash), eq(transactions.organizationId, orgId))).limit(1);
      if (!tx) continue;

      const existing = await db.select().from(transactionClients)
        .where(eq(transactionClients.transactionId, tx.id)).limit(1);
      if (existing.length > 0) continue;

      const clientUuid = v1ClientId ? (v1IdToUuid.get(v1ClientId) ?? null) : null;
      await db.insert(transactionClients).values({ transactionId: tx.id, clientId: clientUuid });
      txClientInserted++;
    }
    console.log(`Tx→Client assignments: ${txClientInserted} inserted`);
  }

  // ── 3. Migrate tx_matched.json ────────────────────────────────────────────
  const txMatchedPath = `${V1}/tx_matched.json`;
  if (existsSync(txMatchedPath)) {
    const matched: string[] = JSON.parse(readFileSync(txMatchedPath, "utf8"));
    let matchedCount = 0;
    for (const txHash of matched) {
      await db.update(transactions).set({ isMatched: true })
        .where(and(eq(transactions.txHash, txHash), eq(transactions.organizationId, orgId)));
      matchedCount++;
    }
    console.log(`Force-matched: ${matchedCount} transactions`);
  }

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
