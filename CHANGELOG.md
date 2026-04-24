# Changelog

All notable changes to AccPanel are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions aim for
[Semantic Versioning](https://semver.org/) once the project hits a stable 1.0.

Dates are ISO (YYYY-MM-DD). The project is currently pre-1.0; breaking
changes are called out explicitly.

---

## [Unreleased]

Branches merged into `main` without a version bump land here until the next
release is cut.

### Added
- **Project agent team + orchestration protocol** (`chore/agent-team-setup`).
  Thirteen project-scoped Claude subagents under `.claude/agents/` covering
  frontend polish, FIFO engine, Drizzle schema, blockchain import, Next.js
  App Router, RLS audit, runtime verification, code review, user + dev
  documentation, UI/UX review, a bounded 3-round usability-testing loop,
  and release management. `ORCHESTRATION.md` codifies the call graph, the
  `DONE` / `BLOCKED` / `HANDOFF` termination contract, loop-breakers, and
  the one sanctioned recursive chain. `GIT_DISCIPLINE.md` codifies the
  feature-branch workflow, conventional commits, no-force-push rule, and
  the main-only-with-approval merge gate.
- **Demo-org seed script** (`chore/agent-team-setup`). `scripts/seed-demo.ts`
  seeds a synthetic "demo-exchange" organisation with three clients
  (Ada Lovelace / Alan Turing / Grace Hopper), three wallets, and six
  transactions covering the common paths (buy, sell, multi-leg, in_process,
  unmatched-import for the Review badge). Idempotent. Guarded by
  `SEED_ALLOW_DEMO=1` against accidental production seeding. Run with
  `npm run seed:demo`.
- **Investors as a first-class entity on Capital** (`feat/investors-capital`).
  New `investors` table linked from `cash_operations` via `investor_id`.
  Smart-search picker on the Capital page queries existing records by name
  and offers "Create 'X' as new investor" in the same dropdown when no
  match exists. Investors are deliberately separate from clients and
  never appear under `/app/clients`.
- **Help center + user-facing changelog** (`docs/help-center-and-changelog`).
  New `/app/help` route with index, topic pages, and an operator-readable
  version history. Sidebar gains a "Help" entry above Settings.
- **Developer-facing CHANGELOG.md** at the repo root (this file).

### Fixed
- **Investor picker silently showed no suggestions while typing**
  (`feat/investors-capital`). Root cause: `startTransition` swallowed
  server-action errors and the search effect was gated behind `open`,
  which could be false on first keystroke. Rewrote with eager debounced
  search, stale-check against race, and visible error surfacing.
- **`revalidatePath` scope on Capital mutations**
  (`feat/investors-capital`). Switched from page-specific
  `"/app/capital"` to layout-scoped `("/app", "layout")`, matching the
  project-wide convention. Dashboard / FIFO / analytics now refresh in
  sync with capital edits.

### Migration notes
- `feat/investors-capital` adds a new `investors` table and a nullable
  `investor_id` column on `cash_operations`. Run `npx drizzle-kit push`
  (dev) or generate + run a migration (prod) before deploying.
- RLS policy for the `investors` table is not yet in
  `scripts/enable-rls.ts` — add it in a follow-up once
  `feat/iter-8-polish` lands (that branch owns the RLS bootstrap script).

---

## [0.8.1] — 2026-04 (post-release hardening)

Series of small fixes layered on top of the iter-1-through-iter-8 release.

### Fixed
- **Next.js 16 breaking changes.** Renamed `src/middleware.ts` to
  `src/proxy.ts` with `export async function proxy()` per the Next 16
  migration. Hot reload does not apply to proxy changes — restart the
  dev server after editing it.
- **`redirect()` swallowed inside try/catch.** `redirect()` throws a
  Next-internal error. Any `try/catch` around a server action must
  re-throw when `(err as {digest?: string}).digest?.startsWith("NEXT_REDIRECT")`.
- **Onboarding infinite redirect loop.** Moved `/onboarding` from inside
  the `/app` layout (which itself redirects missing-org users to
  `/onboarding`) to its own top-level route.
- **White screen on LAN IP.** Added `allowedDevOrigins: ["192.168.1.121"]`
  to `next.config.ts` so Turbopack accepts the local-network IP as a dev
  origin.
- **Server component clicked but did nothing.** Removed `onMouseEnter`
  from server-component `Link`s — event handlers can only attach on
  client components in the App Router.
- **FK constraints on auth UUIDs.** Dropped foreign keys from
  `created_by`, `user_id`, `invited_by` pointing at `public.users` —
  those columns hold Supabase `auth.users` UUIDs, which do not appear
  in `public.users`, so the FK violated on every insert.
- **Empty-state import prompt on the dashboard** nudged users to start
  an import even when imports were already configured. Removed.
- **SQL injection risk in dashboard filters.** Switched to Drizzle's
  `inArray(...)` builder so currency/chain filter values are
  parametrised, not concatenated.
- **Missing env var guard in middleware.** Middleware now passes through
  without auth checks when `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent (useful for preview
  deploys with no env yet), instead of 500-ing.
- **FIFO correctness — four bugs** in the cost-basis engine covering
  lot `originalAmount` tracking, week-bucket Monday anchoring, and
  negative-remaining edge cases.
- **FIFO correctness — short-position rate=0 guard.** Introduced
  `if (short[1] > 1e-9)` so closing a fiat/fiat-origin short with a
  USDT buy no longer produces a spurious gain.
- **FIFO correctness — fiat/fiat swap lot handling.** Fiat-fiat swaps
  with no prior lots now create a short instead of a ghost open lot;
  subsequent incoming-fiat closes the short cleanly.

### Added
- **Landing page + UI/UX overhaul.** Public-facing marketing page at
  `/`; dark theme polish across the authenticated app.

---

## [0.8.0] — 2026-03 (initial feature-complete release)

First end-to-end feature-complete release of AccPanel v2. Iterations 0
through 8, merged through `dev` into `main`.

### Added
- **Iter 0 — Foundation.** Next.js 16.2.3 (App Router, Turbopack) +
  TypeScript 5 strict + Tailwind v4 + Supabase Postgres via Drizzle ORM
  (`drizzle-orm/postgres-js`) + Supabase Auth via `@supabase/ssr`.
  Proxy-based auth gate, Drizzle schema barrel, CI.
- **Iter 1 — Auth & onboarding.** Login, signup, email-verified auth
  flow, org creation on onboarding, sidebar, CI pipeline (typecheck,
  lint, Vitest, build) on Node 24.
- **Iter 2 — Wallets & currencies.** Per-org wallets (TRON, ETH, BNB,
  SOL), per-org currencies (crypto + fiat), import-target tracking with
  auto-import toggles.
- **Iter 3 — Transactions schema & migration.** Double-entry transactions
  with legs (`direction` in `'in' | 'out' | 'fee'`), CSV migration from
  the v1 Python/Flask app, list UI with filters.
- **Iter 4 — Blockchain import pipeline.** TronGrid (TRC20 + TRX),
  Etherscan / BscScan (EVM normal + ERC20), Helius (SOL + SPL), all
  idempotent by `tx_hash`, with per-wallet sync status.
- **Iter 5 — Clients & matching.** Clients with counterparty wallets,
  transaction → client assignment, auto-derivation of counterparty
  wallets from tx addresses.
- **Iter 6 — FIFO engine & analytics.** In-memory FIFO cost basis with
  short-position matching (exchange-office semantics — gain = spread,
  not proceeds), period buckets (day / week / month / custom), spread
  analysis per currency pair.
- **Iter 7 — Capital, debts, data hub.** Cash-operation ledger for
  investor deposits / withdrawals, client debt tracking, CSV/JSON
  import/export hub.
- **Iter 8 — Settings, polish, multi-tenant hardening.** Org settings
  (name, base currency, timezone), member management with invites and
  token-based accept flow, currency and transaction-type management,
  audit log, visual polish across every page.

---

## Versioning policy

Until `1.0.0`, a minor version bump (`0.x.0 → 0.(x+1).0`) marks a
release-worthy feature bundle; a patch bump (`0.x.0 → 0.x.1`) collects
fixes and small additions shipped between features. Breaking schema or
API changes will be called out explicitly in the `### Migration notes`
subsection of the affected release.

`1.0.0` will be cut once the FIFO engine, multi-tenant RLS posture, and
import pipeline have been externally audited.
