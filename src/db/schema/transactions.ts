import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./system";
import { wallets } from "./wallets";

// ── Transactions ──────────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    txHash: text("tx_hash"), // blockchain TxID (null for manual entries)
    chain: text("chain"), // 'TRON' | 'ETH' | 'BNB' | 'SOL'
    type: text("type").notNull(), // 'Trade' | 'Transfer' | ...
    transactionType: text("transaction_type"), // user-assigned: Exchange, Revenue, Expense, Debt, ...
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    location: text("location"), // wallet address or named account
    comment: text("comment"),
    status: text("status"), // 'done' | 'in_process' | 'failed' | 'unknown'
    isMatched: boolean("is_matched").default(false).notNull(),
    raw: jsonb("raw"), // original CSV row preserved verbatim
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete — never hard-delete financial records
  },
  (t) => [
    index("transactions_org_idx").on(t.organizationId),
    index("transactions_timestamp_idx").on(t.timestamp),
    index("transactions_tx_hash_idx").on(t.txHash),
    index("transactions_location_idx").on(t.location),
    // Composite: most common query pattern (org + time desc)
    index("transactions_org_ts_idx").on(t.organizationId, t.timestamp),
    // Composite: type filter (org + type)
    index("transactions_org_type_idx").on(t.organizationId, t.transactionType),
    // Soft-delete: nearly every query adds `AND deleted_at IS NULL`
    // Covering the org+deleted composite avoids a post-filter scan on large tables
    index("transactions_org_deleted_idx").on(t.organizationId, t.deletedAt),
    // Dashboard unmatched count: org + isMatched + deletedAt
    index("transactions_org_matched_idx").on(t.organizationId, t.isMatched, t.deletedAt),
  ]
);

// ── Transaction Legs ──────────────────────────────────────────────────────────

export const transactionLegs = pgTable(
  "transaction_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id, { onDelete: "cascade" })
      .notNull(),
    direction: text("direction").notNull(), // 'in' | 'out' | 'fee'
    amount: numeric("amount", { precision: 28, scale: 10 }),
    currency: text("currency"),
    location: text("location"), // wallet address or named account for this leg
    walletId: uuid("wallet_id").references(() => wallets.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("legs_transaction_idx").on(t.transactionId),
    index("legs_currency_idx").on(t.currency),
    // Composite: fetch legs by tx + direction in one index scan
    index("legs_tx_dir_idx").on(t.transactionId, t.direction),
  ]
);
