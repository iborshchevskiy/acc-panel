import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./system";

// ── Cash Operations (investor capital tracking) ───────────────────────────────

export const cashOperations = pgTable(
  "cash_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
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
  ]
);
