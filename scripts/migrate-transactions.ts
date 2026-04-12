/**
 * Migrate all_wallets_master.csv → transactions + transaction_legs
 * Run: ORG_ID=<uuid> npx tsx scripts/migrate-transactions.ts
 *
 * Safe to run multiple times — skips rows whose tx_hash already exists for this org.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { transactions, transactionLegs } from "../src/db/schema/transactions";
import { wallets } from "../src/db/schema/wallets";
import { eq, and } from "drizzle-orm";

const CSV_PATH = resolve(__dirname, "../../acc_prog/all_wallets_master.csv");

interface CsvRow {
  Date: string;
  Type: string;
  "Transaction Type": string;
  "Income Amount": string;
  "Income Currency": string;
  "Outcome Amount": string;
  "Outcome Currency": string;
  Fee: string;
  "Fee Currency": string;
  TxID: string;
  From: string;
  To: string;
  Comment: string;
  Location: string;
}

function parseCsv(raw: string): CsvRow[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row as unknown as CsvRow;
  });
}

function extractAddress(urlOrAddr: string): string {
  // https://tronscan.org/#/address/T... → T...
  const m = urlOrAddr.match(/\/address\/([^/]+)$/);
  return m ? m[1] : urlOrAddr;
}

function detectChain(txid: string, location: string): string {
  if (location.startsWith("T") || txid.length === 64) return "TRON";
  if (location.startsWith("0x")) return "ETH";
  return "TRON";
}

async function main() {
  const orgId = process.argv[2] || process.env.ORG_ID;
  if (!orgId) {
    console.error("Usage: ORG_ID=<uuid> npx tsx scripts/migrate-transactions.ts");
    process.exit(1);
  }

  const raw = readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, ""); // strip BOM
  const rows = parseCsv(raw);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  // Build wallet address → id map for this org
  const orgWallets = await db
    .select({ id: wallets.id, address: wallets.address })
    .from(wallets)
    .where(eq(wallets.organizationId, orgId));
  const walletMap = new Map(orgWallets.map((w) => [w.address, w.id]));

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const txHash = row.TxID || null;

      // Idempotency: skip if this txHash already exists for this org
      if (txHash) {
        const existing = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.txHash, txHash), eq(transactions.organizationId, orgId)))
          .limit(1);
        if (existing.length > 0) { skipped++; continue; }
      }

      const location = row.Location || null;
      const chain = detectChain(row.TxID, location ?? "");
      const fromAddr = row.From ? extractAddress(row.From) : null;
      const toAddr = row.To ? extractAddress(row.To) : null;

      const [tx] = await db
        .insert(transactions)
        .values({
          organizationId: orgId,
          txHash,
          chain,
          type: row.Type || "Trade",
          transactionType: row["Transaction Type"] || null,
          timestamp: new Date(row.Date),
          fromAddress: fromAddr,
          toAddress: toAddr,
          location,
          comment: row.Comment || null,
          isMatched: false,
          raw: row as unknown as Record<string, string>,
        })
        .returning({ id: transactions.id });

      // Income leg
      if (row["Income Amount"] && row["Income Currency"]) {
        const walletId = location ? (walletMap.get(location) ?? null) : null;
        await db.insert(transactionLegs).values({
          transactionId: tx.id,
          direction: "in",
          amount: row["Income Amount"],
          currency: row["Income Currency"],
          walletId,
        });
      }

      // Outcome leg
      if (row["Outcome Amount"] && row["Outcome Currency"]) {
        const walletId = location ? (walletMap.get(location) ?? null) : null;
        await db.insert(transactionLegs).values({
          transactionId: tx.id,
          direction: "out",
          amount: row["Outcome Amount"],
          currency: row["Outcome Currency"],
          walletId,
        });
      }

      // Fee leg
      if (row["Fee"] && row["Fee Currency"]) {
        await db.insert(transactionLegs).values({
          transactionId: tx.id,
          direction: "fee",
          amount: row["Fee"],
          currency: row["Fee Currency"],
        });
      }

      inserted++;
    } catch (e) {
      console.error(`Error on row TxID=${row.TxID}:`, e);
      errors++;
    }
  }

  console.log(`\nDone — ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
  console.log(`Total CSV rows: ${rows.length} | DB + skipped: ${inserted + skipped}`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
