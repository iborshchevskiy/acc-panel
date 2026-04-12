/**
 * Seed currencies table from currencies_config.json (v1)
 * Run: npx tsx scripts/seed-currencies.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { currencies } from "../src/db/schema/wallets";
import { eq } from "drizzle-orm";

const CRYPTO_CURRENCIES = [
  { code: "USDT", name: "Tether USD", decimals: 6, coingeckoId: "tether" },
  { code: "TRX", name: "TRON", decimals: 6, coingeckoId: "tron" },
  { code: "ETH", name: "Ethereum", decimals: 18, coingeckoId: "ethereum" },
  { code: "BNB", name: "BNB", decimals: 18, coingeckoId: "binancecoin" },
  { code: "SOL", name: "Solana", decimals: 9, coingeckoId: "solana" },
  { code: "USDC", name: "USD Coin", decimals: 6, coingeckoId: "usd-coin" },
  { code: "BTC", name: "Bitcoin", decimals: 8, coingeckoId: "bitcoin" },
];

const FIAT_CURRENCIES = ["EUR", "USD", "CZK", "PLN", "GBP", "UAH", "RUB"];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  let inserted = 0;
  let skipped = 0;

  // Crypto
  for (const c of CRYPTO_CURRENCIES) {
    const existing = await db.select().from(currencies).where(eq(currencies.code, c.code));
    if (existing.length === 0) {
      await db.insert(currencies).values({ ...c, type: "crypto" });
      console.log(`  + ${c.code} (crypto)`);
      inserted++;
    } else {
      skipped++;
    }
  }

  // Fiat
  for (const code of FIAT_CURRENCIES) {
    const existing = await db.select().from(currencies).where(eq(currencies.code, code));
    if (existing.length === 0) {
      await db.insert(currencies).values({ code, type: "fiat", decimals: 2 });
      console.log(`  + ${code} (fiat)`);
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone — ${inserted} inserted, ${skipped} skipped`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
