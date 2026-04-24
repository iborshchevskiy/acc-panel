import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./system";
import { transactions } from "./transactions";

// ── Clients ───────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    v1Id: text("v1_id"), // original v1 hex id — for migration deduplication
    name: text("name").notNull(),
    surname: text("surname"),
    tgUsername: text("tg_username"),
    tgId: text("tg_id"),
    note: text("note"),
    // KYC fields
    dateOfBirth: text("date_of_birth"),
    sex: text("sex"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    sourceOfFunds: text("source_of_funds"),
    sourceOfWealth: text("source_of_wealth"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("clients_org_idx").on(t.organizationId)]
);

// ── Client Wallets (counterparty addresses linked to a client) ────────────────

export const clientWallets = pgTable(
  "client_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    address: text("address").notNull(),
    chain: text("chain").default("TRON").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("client_wallets_client_idx").on(t.clientId),
    index("client_wallets_address_idx").on(t.address),
  ]
);

// ── Client KYC documents (uploaded files) ────────────────────────────────────

export const clientDocuments = pgTable(
  "client_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    docType: text("doc_type").notNull(), // "proof_of_address" | "source_of_funds" | "source_of_wealth"
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    storageKey: text("storage_key").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("client_docs_client_idx").on(t.clientId),
    index("client_docs_org_idx").on(t.organizationId),
  ]
);

// ── Transaction → Client assignments ─────────────────────────────────────────

export const transactionClients = pgTable(
  "transaction_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id, { onDelete: "cascade" })
      .notNull(),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "set null" }), // null = explicitly unassigned
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tx_clients_tx_idx").on(t.transactionId),
    index("tx_clients_client_idx").on(t.clientId),
  ]
);
