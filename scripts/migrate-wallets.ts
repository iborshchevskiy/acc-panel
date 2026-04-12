/**
 * Migrate wallets from v1 wallets_whitelist → WALLET table
 * Run: npx tsx scripts/migrate-wallets.ts <org-id>
 *
 * Get org-id from: SELECT id FROM organizations LIMIT 1;
 * Or pass as env: ORG_ID=... npx tsx scripts/migrate-wallets.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { wallets, importTargets } from "../src/db/schema/wallets";
import { eq, and } from "drizzle-orm";

const V1_WHITELIST = resolve(__dirname, "../../acc_prog/wallets_whitelist");

function detectChain(address: string): string {
  if (address.startsWith("T")) return "TRON";
  if (address.startsWith("0x")) return "ETH"; // could be BNB too, default ETH
  if (address.length === 44) return "SOL";
  return "TRON";
}

async function main() {
  const orgId = process.argv[2] || process.env.ORG_ID;
  if (!orgId) {
    console.error("Usage: npx tsx scripts/migrate-wallets.ts <org-id>");
    console.error("Or:    ORG_ID=<org-id> npx tsx scripts/migrate-wallets.ts");
    process.exit(1);
  }

  const raw = readFileSync(V1_WHITELIST, "utf8");
  const addresses = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  console.log(`Found ${addresses.length} wallet(s) in v1 whitelist`);

  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  let inserted = 0;
  let skipped = 0;

  for (const address of addresses) {
    const chain = detectChain(address);
    const existing = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.address, address), eq(wallets.organizationId, orgId)));

    if (existing.length === 0) {
      const [wallet] = await db
        .insert(wallets)
        .values({ organizationId: orgId, address, chain, isActive: true })
        .returning({ id: wallets.id });

      await db.insert(importTargets).values({ walletId: wallet.id, syncStatus: "idle" });

      console.log(`  + ${address} (${chain})`);
      inserted++;
    } else {
      console.log(`  ~ ${address} already exists`);
      skipped++;
    }
  }

  console.log(`\nDone — ${inserted} inserted, ${skipped} skipped`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
