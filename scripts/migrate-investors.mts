/**
 * Targeted migration for the investors feature:
 *   - creates `investors` table if missing
 *   - adds `investor_id` FK column on `cash_operations` if missing
 *   - creates the supporting indexes
 *
 * Idempotent. Safe to re-run. Doesn't touch any other table.
 *
 * Run: npx tsx scripts/migrate-investors.mts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL (or DATABASE_URL) missing from .env.local");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  console.log(`Applying investors migration...`);

  // 1. investors table
  await sql`
    CREATE TABLE IF NOT EXISTS investors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✓ investors table");

  // 2. indexes on investors
  await sql`CREATE INDEX IF NOT EXISTS investors_org_idx ON investors(organization_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS investors_org_name_unique ON investors(organization_id, name)`;
  console.log("  ✓ investors indexes");

  // 3. investor_id column on cash_operations
  //    Add the column, then the FK (the FK can't be inlined with ADD COLUMN IF NOT EXISTS).
  await sql`
    ALTER TABLE cash_operations
    ADD COLUMN IF NOT EXISTS investor_id UUID
  `;
  // Add FK only if it doesn't already exist. Guard via information_schema.
  const [fk] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'cash_operations'
        AND constraint_name = 'cash_operations_investor_id_fkey'
    ) AS exists
  `;
  if (!fk.exists) {
    await sql`
      ALTER TABLE cash_operations
      ADD CONSTRAINT cash_operations_investor_id_fkey
      FOREIGN KEY (investor_id) REFERENCES investors(id) ON DELETE SET NULL
    `;
  }
  console.log("  ✓ cash_operations.investor_id + FK");

  // 4. index on the new column
  await sql`CREATE INDEX IF NOT EXISTS cash_ops_investor_id_idx ON cash_operations(investor_id)`;
  console.log("  ✓ cash_ops_investor_id index");

  // 5. Backfill — create an investor record for every distinct
  //    (organization_id, investor-name) pair that exists in cash_operations
  //    but has no investor_id yet. Idempotent via ON CONFLICT on the
  //    unique (organization_id, name) index.
  const createdRows = await sql`
    INSERT INTO investors (organization_id, name)
    SELECT DISTINCT organization_id, TRIM(investor)
    FROM cash_operations
    WHERE investor_id IS NULL
      AND investor IS NOT NULL
      AND TRIM(investor) <> ''
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id
  `;
  console.log(`  ✓ backfill: created ${createdRows.length} investor records from existing rows`);

  // 6. Link every unlinked cash_operations row to its matching investor.
  //    Safe to re-run: the investor_id IS NULL guard stops it touching
  //    already-linked rows.
  const linkedRows = await sql`
    UPDATE cash_operations AS co
    SET investor_id = i.id
    FROM investors AS i
    WHERE co.investor_id IS NULL
      AND co.organization_id = i.organization_id
      AND TRIM(co.investor) = i.name
    RETURNING co.id
  `;
  console.log(`  ✓ backfill: linked ${linkedRows.length} existing cash_operations rows`);

  // 7. verification probe — the exact query that was 500-ing + investor counts
  const probe = await sql`
    SELECT COUNT(*)::int AS n FROM cash_operations WHERE organization_id IS NOT NULL
  `;
  const [investorCount] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM investors
  `;
  console.log(`\nprobe: ${probe[0].n} cash_operations rows · ${investorCount.n} investors`);
  console.log("DONE.");
}

main()
  .catch((e) => { console.error("\nFAILED:", e); process.exit(1); })
  .finally(() => sql.end());
