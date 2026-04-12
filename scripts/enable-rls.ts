/**
 * Enables Row Level Security on all tables and creates policies.
 *
 * Architecture note:
 * - The Next.js app connects via postgres.js with DATABASE_URL (direct/service-role) → bypasses RLS (intentional).
 * - RLS guards against direct Supabase client access (anon/authenticated roles from outside the app).
 * - Audit logs are made append-only: no authenticated user can UPDATE or DELETE them.
 *
 * Run: npx tsx scripts/enable-rls.ts
 */
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
});

const ORG_MEMBER_SUBQUERY = `
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND is_active = true
`;

async function run() {
  console.log("Enabling RLS...");

  const tables = [
    "organizations",
    "organization_members",
    "pending_invites",
    "audit_logs",
    "transactions",
    "transaction_legs",
    "wallets",
    "import_targets",
    "currencies",
    "org_transaction_types",
    "clients",
    "client_wallets",
    "transaction_clients",
    "cash_operations",
    "tax_lots",
    "tax_lot_disposals",
    "price_snapshots",
  ];

  // Enable RLS on all tables
  for (const table of tables) {
    await sql`ALTER TABLE ${sql(table)} ENABLE ROW LEVEL SECURITY`;
    console.log(`  ✓ RLS enabled on ${table}`);
  }

  // Drop any existing policies to start clean
  const existingPolicies = await sql`
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  `;
  for (const p of existingPolicies) {
    await sql.unsafe(`DROP POLICY IF EXISTS "${p.policyname}" ON "${p.tablename}"`);
  }
  console.log("  ✓ Dropped existing policies");

  // ── organizations ──────────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "orgs_member_select" ON organizations FOR SELECT TO authenticated
    USING (id IN (${ORG_MEMBER_SUBQUERY}))
  `);
  await sql.unsafe(`
    CREATE POLICY "orgs_member_update" ON organizations FOR UPDATE TO authenticated
    USING (id IN (${ORG_MEMBER_SUBQUERY}))
  `);
  console.log("  ✓ organizations policies");

  // ── organization_members ───────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "members_org_select" ON organization_members FOR SELECT TO authenticated
    USING (organization_id IN (${ORG_MEMBER_SUBQUERY}))
  `);
  await sql.unsafe(`
    CREATE POLICY "members_self_select" ON organization_members FOR SELECT TO authenticated
    USING (user_id = auth.uid())
  `);
  console.log("  ✓ organization_members policies");

  // ── pending_invites ────────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "invites_org_select" ON pending_invites FOR SELECT TO authenticated
    USING (organization_id IN (${ORG_MEMBER_SUBQUERY}))
  `);
  // Anyone authenticated can see an invite by its token (to accept it)
  await sql.unsafe(`
    CREATE POLICY "invites_token_select" ON pending_invites FOR SELECT TO authenticated
    USING (true)
  `);
  console.log("  ✓ pending_invites policies");

  // ── audit_logs — APPEND-ONLY ───────────────────────────────────────────────
  // authenticated can SELECT and INSERT but NEVER UPDATE or DELETE
  await sql.unsafe(`
    CREATE POLICY "audit_select" ON audit_logs FOR SELECT TO authenticated
    USING (organization_id IN (${ORG_MEMBER_SUBQUERY}))
  `);
  await sql.unsafe(`
    CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (${ORG_MEMBER_SUBQUERY}))
  `);
  // No UPDATE or DELETE policy = append-only for authenticated
  console.log("  ✓ audit_logs policies (append-only enforced)");

  // ── transactions ───────────────────────────────────────────────────────────
  for (const op of ["SELECT", "INSERT", "UPDATE"]) {
    const clause = op === "INSERT" ? "WITH CHECK" : "USING";
    await sql.unsafe(`
      CREATE POLICY "txs_org_${op.toLowerCase()}" ON transactions FOR ${op} TO authenticated
      ${clause} (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  console.log("  ✓ transactions policies");

  // ── transaction_legs ──────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "legs_org_select" ON transaction_legs FOR SELECT TO authenticated
    USING (
      transaction_id IN (
        SELECT id FROM transactions WHERE organization_id IN (${ORG_MEMBER_SUBQUERY})
      )
    )
  `);
  await sql.unsafe(`
    CREATE POLICY "legs_org_insert" ON transaction_legs FOR INSERT TO authenticated
    WITH CHECK (
      transaction_id IN (
        SELECT id FROM transactions WHERE organization_id IN (${ORG_MEMBER_SUBQUERY})
      )
    )
  `);
  console.log("  ✓ transaction_legs policies");

  // ── wallets ────────────────────────────────────────────────────────────────
  for (const op of ["SELECT", "INSERT", "UPDATE"]) {
    const clause = op === "INSERT" ? "WITH CHECK" : "USING";
    await sql.unsafe(`
      CREATE POLICY "wallets_org_${op.toLowerCase()}" ON wallets FOR ${op} TO authenticated
      ${clause} (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  console.log("  ✓ wallets policies");

  // ── import_targets ─────────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "import_targets_select" ON import_targets FOR SELECT TO authenticated
    USING (
      wallet_id IN (
        SELECT id FROM wallets WHERE organization_id IN (${ORG_MEMBER_SUBQUERY})
      )
    )
  `);
  console.log("  ✓ import_targets policies");

  // ── currencies ─────────────────────────────────────────────────────────────
  for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    const clause = op === "INSERT" ? "WITH CHECK" : "USING";
    await sql.unsafe(`
      CREATE POLICY "currencies_org_${op.toLowerCase()}" ON currencies FOR ${op} TO authenticated
      ${clause} (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  console.log("  ✓ currencies policies");

  // ── org_transaction_types ──────────────────────────────────────────────────
  for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    const clause = op === "INSERT" ? "WITH CHECK" : "USING";
    await sql.unsafe(`
      CREATE POLICY "orgtypes_org_${op.toLowerCase()}" ON org_transaction_types FOR ${op} TO authenticated
      ${clause} (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  console.log("  ✓ org_transaction_types policies");

  // ── clients ────────────────────────────────────────────────────────────────
  for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    const clause = op === "INSERT" ? "WITH CHECK" : "USING";
    await sql.unsafe(`
      CREATE POLICY "clients_org_${op.toLowerCase()}" ON clients FOR ${op} TO authenticated
      ${clause} (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  console.log("  ✓ clients policies");

  // ── client_wallets ─────────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "client_wallets_select" ON client_wallets FOR SELECT TO authenticated
    USING (
      client_id IN (
        SELECT id FROM clients WHERE organization_id IN (${ORG_MEMBER_SUBQUERY})
      )
    )
  `);
  console.log("  ✓ client_wallets policies");

  // ── transaction_clients ────────────────────────────────────────────────────
  await sql.unsafe(`
    CREATE POLICY "tx_clients_select" ON transaction_clients FOR SELECT TO authenticated
    USING (
      transaction_id IN (
        SELECT id FROM transactions WHERE organization_id IN (${ORG_MEMBER_SUBQUERY})
      )
    )
  `);
  console.log("  ✓ transaction_clients policies");

  // ── cash_operations ────────────────────────────────────────────────────────
  for (const op of ["SELECT", "INSERT", "DELETE"]) {
    const clause = op === "INSERT" ? "WITH CHECK" : "USING";
    await sql.unsafe(`
      CREATE POLICY "cash_ops_org_${op.toLowerCase()}" ON cash_operations FOR ${op} TO authenticated
      ${clause} (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  console.log("  ✓ cash_operations policies");

  // ── analytics tables ───────────────────────────────────────────────────────
  for (const table of ["tax_lots", "tax_lot_disposals"]) {
    await sql.unsafe(`
      CREATE POLICY "${table}_select" ON ${table} FOR SELECT TO authenticated
      USING (organization_id IN (${ORG_MEMBER_SUBQUERY}))
    `);
  }
  await sql.unsafe(`
    CREATE POLICY "price_snapshots_select" ON price_snapshots FOR SELECT TO authenticated
    USING (true)
  `);
  console.log("  ✓ analytics table policies");

  console.log("\n✅ RLS setup complete");
  await sql.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
