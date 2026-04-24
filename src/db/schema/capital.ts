import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./system";

// ── Investors (capital providers — distinct from clients) ────────────────────
//
// Investors fund the exchange office's float. Unlike clients, they do not
// transact with the office; they provide and withdraw capital. Managed on
// the Capital page, never the Clients page.

export const investors = pgTable(
  "investors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    name: text("name").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("investors_org_idx").on(t.organizationId),
    // One investor record per name per org — prevents dupes from smart-search re-typing
    uniqueIndex("investors_org_name_unique").on(t.organizationId, t.name),
  ]
);

// ── Cash Operations (investor capital tracking) ───────────────────────────────

export const cashOperations = pgTable(
  "cash_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    // Optional FK to the investors table. Null for legacy rows created before
    // investors became a first-class entity; the `investor` text column is kept
    // as the display name source and is always populated.
    investorId: uuid("investor_id").references(() => investors.id, { onDelete: "set null" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    investor: text("investor").notNull(),
    amount: numeric("amount", { precision: 28, scale: 10 }).notNull(),
    currency: text("currency").notNull(),
    type: text("type").notNull(), // 'deposit' | 'withdrawal'
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cash_ops_org_idx").on(t.organizationId),
    index("cash_ops_investor_idx").on(t.investor),
    index("cash_ops_investor_id_idx").on(t.investorId),
  ]
);
