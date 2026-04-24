/**
 * Seeds a demo organisation with synthetic data for screenshots,
 * user-guide content, and the usability-tester loop.
 *
 * IDEMPOTENT. Safe to re-run. Re-running will NOT duplicate rows;
 * missing pieces will be filled in.
 *
 * Requires:
 *   - .env.local with DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - SEED_ALLOW_DEMO=1 (explicit opt-in — guards against accidental prod seeding)
 *
 * Run: SEED_ALLOW_DEMO=1 npm run seed:demo
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const DEMO_ORG_SLUG = "demo-exchange";
const DEMO_ORG_NAME = "Demo Exchange Office";
const DEMO_EMAIL = "demo@accpanel.app";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "demo-local-only-change-me";

if (process.env.SEED_ALLOW_DEMO !== "1") {
  console.error(
    "Refusing to seed: set SEED_ALLOW_DEMO=1 to proceed.\n" +
    "This script writes a demo org + demo user into the target database.\n" +
    "Never run against production.",
  );
  process.exit(1);
}

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DIRECT_URL (or DATABASE_URL) missing from .env.local");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 2 });
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function upsertDemoUser(): Promise<string> {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) {
    console.log(`demo user exists: ${existing.id}`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  console.log(`demo user created: ${data.user.id}`);
  return data.user.id;
}

async function upsertOrg(userId: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, base_currency, timezone, created_by)
    VALUES (${DEMO_ORG_NAME}, ${DEMO_ORG_SLUG}, 'USD', 'UTC', ${userId})
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  console.log(`org ready: ${row.id}`);
  return row.id;
}

async function upsertMember(orgId: string, userId: string) {
  const [existing] = await sql`
    SELECT id FROM organization_members
    WHERE organization_id = ${orgId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (existing) return;
  await sql`
    INSERT INTO organization_members (organization_id, user_id, email, role, accepted_at, is_active)
    VALUES (${orgId}, ${userId}, ${DEMO_EMAIL}, 'org_admin', NOW(), true)
  `;
  console.log("org member inserted");
}

async function upsertCurrencies(orgId: string) {
  const specs: Array<{ code: string; type: "fiat" | "crypto" }> = [
    { code: "USD", type: "fiat" },
    { code: "EUR", type: "fiat" },
    { code: "CZK", type: "fiat" },
    { code: "USDT", type: "crypto" },
    { code: "TRX", type: "crypto" },
  ];
  for (const c of specs) {
    await sql`
      INSERT INTO currencies (organization_id, code, type)
      VALUES (${orgId}, ${c.code}, ${c.type})
      ON CONFLICT (organization_id, code) DO NOTHING
    `;
  }
  console.log("currencies seeded");
}

async function upsertTxType(orgId: string, name: string) {
  await sql`
    INSERT INTO org_transaction_types (organization_id, name)
    VALUES (${orgId}, ${name})
    ON CONFLICT (organization_id, name) DO NOTHING
  `;
}

async function upsertTxTypes(orgId: string) {
  for (const name of ["Exchange", "Revenue", "Expense", "Debt"]) {
    await upsertTxType(orgId, name);
  }
  console.log("transaction types seeded");
}

async function upsertWallet(
  orgId: string,
  address: string,
  chain: string,
  label: string,
): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM wallets
    WHERE organization_id = ${orgId} AND address = ${address}
    LIMIT 1
  `;
  if (existing) return existing.id;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO wallets (organization_id, address, chain, label, is_active)
    VALUES (${orgId}, ${address}, ${chain}, ${label}, true)
    RETURNING id
  `;
  return row.id;
}

async function upsertWallets(orgId: string) {
  const specs = [
    { address: "TDEMO1111111111111111111111111111",         chain: "TRON", label: "Demo TRON hot wallet" },
    { address: "0xDEMO00000000000000000000000000000000DEMO", chain: "ETH",  label: "Demo ETH hot wallet" },
    { address: "DEMO111111111111111111111111111111111111111", chain: "SOL", label: "Demo SOL hot wallet" },
  ];
  for (const w of specs) {
    await upsertWallet(orgId, w.address, w.chain, w.label);
  }
  console.log("wallets seeded");
}

async function upsertClient(
  orgId: string,
  name: string,
  surname: string,
  email: string,
  dateOfBirth: string,
): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM clients
    WHERE organization_id = ${orgId} AND name = ${name} AND surname = ${surname}
    LIMIT 1
  `;
  if (existing) return existing.id;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO clients (organization_id, name, surname, email, date_of_birth)
    VALUES (${orgId}, ${name}, ${surname}, ${email}, ${dateOfBirth})
    RETURNING id
  `;
  return row.id;
}

async function upsertClients(orgId: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  ids["Ada"]   = await upsertClient(orgId, "Ada",   "Lovelace", "ada@example.test",   "1815-12-10");
  ids["Alan"]  = await upsertClient(orgId, "Alan",  "Turing",   "alan@example.test",  "1912-06-23");
  ids["Grace"] = await upsertClient(orgId, "Grace", "Hopper",   "grace@example.test", "1906-12-09");
  console.log(`clients seeded: ${Object.keys(ids).length}`);
  return ids;
}

// ── transaction seeding ──────────────────────────────────────────────────────

interface LegSpec { direction: "in" | "out" | "fee"; amount: string; currency: string; }
interface TxSpec {
  daysAgo: number;
  type: string;                // coarse type (Trade, Manual, ...)
  transactionType: string | null; // user-assigned type
  status: string | null;       // null | 'in_process' | 'done'
  legs: LegSpec[];
  txHash: string;
  chain?: string | null;
  client?: string;
  comment?: string | null;
}

async function upsertTransaction(
  orgId: string,
  spec: TxSpec,
  clientIds: Record<string, string>,
) {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM transactions
    WHERE organization_id = ${orgId} AND tx_hash = ${spec.txHash}
    LIMIT 1
  `;
  if (existing) return; // already seeded

  const ts = new Date(Date.now() - spec.daysAgo * 24 * 3600 * 1000);
  const [tx] = await sql<{ id: string }[]>`
    INSERT INTO transactions (
      organization_id, tx_hash, chain, type, transaction_type,
      timestamp, status, is_matched, comment
    )
    VALUES (
      ${orgId}, ${spec.txHash}, ${spec.chain ?? null}, ${spec.type}, ${spec.transactionType},
      ${ts}, ${spec.status}, ${!!spec.client}, ${spec.comment ?? null}
    )
    RETURNING id
  `;

  for (const leg of spec.legs) {
    await sql`
      INSERT INTO transaction_legs (transaction_id, direction, amount, currency)
      VALUES (${tx.id}, ${leg.direction}, ${leg.amount}, ${leg.currency})
    `;
  }

  if (spec.client && clientIds[spec.client]) {
    await sql`
      INSERT INTO transaction_clients (transaction_id, client_id)
      VALUES (${tx.id}, ${clientIds[spec.client]})
    `;
  }
}

async function upsertTransactions(orgId: string, clientIds: Record<string, string>) {
  const specs: TxSpec[] = [
    // ── Buy 1000 USDT with EUR (completed)
    {
      daysAgo: 14, type: "Trade", transactionType: "Exchange", status: null,
      legs: [
        { direction: "in",  amount: "1000",  currency: "USDT" },
        { direction: "out", amount: "920",   currency: "EUR"  },
      ],
      txHash: "demo-001", client: "Ada", comment: "Buy USDT",
    },
    // ── Sell 500 USDT for EUR (completed, profitable spread)
    {
      daysAgo: 12, type: "Trade", transactionType: "Exchange", status: null,
      legs: [
        { direction: "out", amount: "500", currency: "USDT" },
        { direction: "in",  amount: "470", currency: "EUR"  },
      ],
      txHash: "demo-002", client: "Alan", comment: "Sell USDT",
    },
    // ── Multi-leg with fee
    {
      daysAgo: 10, type: "Trade", transactionType: "Exchange", status: null,
      legs: [
        { direction: "in",  amount: "800", currency: "USDT" },
        { direction: "out", amount: "740", currency: "EUR"  },
        { direction: "fee", amount: "1.5", currency: "USDT" },
      ],
      txHash: "demo-003", client: "Grace", comment: "Buy USDT with fee",
    },
    // ── in_process: received EUR, haven't paid out USDT yet
    {
      daysAgo: 3, type: "Trade", transactionType: "Exchange", status: "in_process",
      legs: [
        { direction: "in", amount: "300", currency: "EUR" },
      ],
      txHash: "demo-004", client: "Ada", comment: "Pending — owe USDT out",
    },
    // ── Blockchain-imported, unmatched (triggers Review badge:
    //    transactionType='Trade' is auto-set; no user-assigned type; no client)
    {
      daysAgo: 1, type: "Trade", transactionType: "Trade", status: null,
      legs: [
        { direction: "in", amount: "200", currency: "USDT" },
      ],
      txHash: "demo-tron-0001", chain: "TRON",
    },
    // ── Another imported unmatched for the Review list
    {
      daysAgo: 1, type: "Trade", transactionType: "Trade", status: null,
      legs: [
        { direction: "in", amount: "1.25", currency: "TRX" },
      ],
      txHash: "demo-tron-0002", chain: "TRON",
    },
  ];

  for (const spec of specs) {
    await upsertTransaction(orgId, spec, clientIds);
  }
  console.log(`transactions ensured: ${specs.length}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`seeding demo org '${DEMO_ORG_SLUG}' into ${databaseUrl?.replace(/:[^:@]+@/, ":***@")}`);
  try {
    const userId = await upsertDemoUser();
    const orgId = await upsertOrg(userId);
    await upsertMember(orgId, userId);
    await upsertCurrencies(orgId);
    await upsertTxTypes(orgId);
    await upsertWallets(orgId);
    const clientIds = await upsertClients(orgId);
    await upsertTransactions(orgId, clientIds);
    console.log("\nDONE.");
    console.log(`  org slug:  ${DEMO_ORG_SLUG}`);
    console.log(`  org id:    ${orgId}`);
    console.log(`  login:     ${DEMO_EMAIL}`);
    console.log(`  password:  ${DEMO_PASSWORD === "demo-local-only-change-me" ? "demo-local-only-change-me (set SEED_DEMO_PASSWORD to override)" : "(from SEED_DEMO_PASSWORD)"}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
