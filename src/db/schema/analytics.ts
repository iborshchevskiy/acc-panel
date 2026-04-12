import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./system";
import { transactions, transactionLegs } from "./transactions";

// ── Tax Lots (FIFO open positions) ────────────────────────────────────────────

export const taxLots = pgTable(
  "tax_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id)
      .notNull(),
    legId: uuid("leg_id").references(() => transactionLegs.id),
    pair: text("pair").notNull(),           // e.g. "USDT/EUR"
    cryptoCurrency: text("crypto_currency").notNull(),
    fiatCurrency: text("fiat_currency").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull(),
    originalAmount: numeric("original_amount", { precision: 28, scale: 10 }).notNull(),
    remainingAmount: numeric("remaining_amount", { precision: 28, scale: 10 }).notNull(),
    costRate: numeric("cost_rate", { precision: 28, scale: 10 }).notNull(), // fiat per crypto
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tax_lots_org_idx").on(t.organizationId),
    index("tax_lots_pair_idx").on(t.pair),
  ]
);

// ── Tax Lot Disposals (FIFO realized gains) ───────────────────────────────────

export const taxLotDisposals = pgTable(
  "tax_lot_disposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    lotId: uuid("lot_id").references(() => taxLots.id).notNull(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id)
      .notNull(),
    pair: text("pair").notNull(),
    disposedAt: timestamp("disposed_at", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 28, scale: 10 }).notNull(),
    proceedsRate: numeric("proceeds_rate", { precision: 28, scale: 10 }).notNull(),
    costRate: numeric("cost_rate", { precision: 28, scale: 10 }).notNull(),
    gain: numeric("gain", { precision: 28, scale: 10 }).notNull(),
    gainCurrency: text("gain_currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("disposals_org_idx").on(t.organizationId),
    index("disposals_pair_idx").on(t.pair),
  ]
);

// ── Price Snapshots ───────────────────────────────────────────────────────────

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    currency: text("currency").notNull(),
    baseCurrency: text("base_currency").notNull(),
    price: numeric("price", { precision: 28, scale: 10 }).notNull(),
    source: text("source").default("manual").notNull(), // 'coingecko' | 'manual'
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("price_snapshots_currency_idx").on(t.currency, t.baseCurrency)]
);
