import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  displayName: text("display_name"),
  systemRole: text("system_role").default("user").notNull(), // 'owner' | 'user'
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ── Organizations ─────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  baseCurrency: text("base_currency").default("USD").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by"), // auth.users UUID — no FK to public.users
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ── Organization Members ──────────────────────────────────────────────────────

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  userId: uuid("user_id").notNull(), // auth.users UUID — no FK to public.users
  email: text("email"), // cached for display
  role: text("role").notNull(), // 'org_admin' | 'accountant' | 'viewer'
  invitedBy: uuid("invited_by"), // auth.users UUID — no FK to public.users
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Most common auth check: userId + isActive
  index("members_user_active_idx").on(t.userId, t.isActive),
  // Org member lookup
  index("members_org_idx").on(t.organizationId, t.isActive),
]);

// ── Pending Invites ───────────────────────────────────────────────────────────

export const pendingInvites = pgTable("pending_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(), // 'org_admin' | 'accountant' | 'viewer'
  token: text("token").unique().notNull(),
  invitedBy: uuid("invited_by").notNull(), // auth.users UUID — no FK
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

// ── Audit Logs ────────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  userId: uuid("user_id"), // auth.users UUID — no FK
  userEmail: text("user_email"), // cached for display
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: text("details"), // JSON string
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

