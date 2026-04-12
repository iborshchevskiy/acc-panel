import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./system";

// ── Currencies (per-org) ──────────────────────────────────────────────────────

export const currencies = pgTable("currencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id), // nullable for migration
  code: text("code").notNull(),
  name: text("name"),
  type: text("type").notNull(), // 'crypto' | 'fiat'
  decimals: integer("decimals").default(8),
  coingeckoId: text("coingecko_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("currencies_org_code_unique").on(t.organizationId, t.code),
]);

// ── Org Transaction Types ─────────────────────────────────────────────────────

export const orgTransactionTypes = pgTable("org_transaction_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("org_tx_types_unique").on(t.organizationId, t.name),
]);

// ── Wallets ───────────────────────────────────────────────────────────────────

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  address: text("address").notNull(),
  label: text("label"),
  chain: text("chain").notNull(), // 'TRON' | 'ETH' | 'BNB' | 'SOL'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Import Targets (per-wallet import state) ──────────────────────────────────

export const importTargets = pgTable("import_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id")
    .references(() => wallets.id)
    .notNull(),
  syncStatus: text("sync_status").default("idle").notNull(), // 'idle' | 'running' | 'done' | 'error'
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  txCount: integer("tx_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
