@AGENTS.md

# AccPanel v2 — Project Intelligence

## What This Is

TypeScript/Next.js/Supabase rewrite of the v1 Python/Flask/CSV accounting panel.
v1 still runs at port 5050 (`/Users/ilya/Documents/projects/acc_prog/`).
v2 lives at `/Users/ilya/Documents/projects/accpanel`, dev on port 3001.

## Stack

- **Framework**: Next.js 16.2.3 (App Router, Turbopack)
- **Language**: TypeScript 5, strict
- **DB**: Supabase PostgreSQL via Drizzle ORM (`drizzle-orm/postgres-js`)
- **Auth**: Supabase Auth via `@supabase/ssr`
- **Styling**: Tailwind CSS v4
- **Runtime**: Node.js 24

## Critical Next.js 16 Differences

- `src/middleware.ts` deprecated → use `src/proxy.ts` with `export async function proxy()`
- `next lint` removed → use `eslint src`
- Hot reload does NOT apply to `proxy.ts` — restart server after any proxy change
- `allowedDevOrigins: ["192.168.1.121"]` required in `next.config.ts` for LAN IP dev access

## Project Structure

```
src/
  app/
    (auth)/          — login, signup (own layout, no sidebar)
    app/             — authenticated area with sidebar layout
      dashboard/
      transactions/
      wallets/
      clients/[id]/
      analytics/
      fifo/
      debts/
      capital/
      data/
      settings/
    onboarding/      — OUTSIDE app/ layout (prevents infinite redirect loop)
    api/
      auth/signout/
      import/[walletId]/  status/
      import/csv/
      export/
  components/
    sidebar.tsx      — props: { userEmail: string; orgName?: string }
    import-button.tsx
  db/
    client.ts        — drizzle instance, postgres.js driver, prepare: false
    schema/          — system, wallets, transactions, clients, analytics, capital
  lib/
    supabase/        — server.ts, middleware.ts (updateSession), client.ts
    import/          — tron.ts, evm.ts, sol.ts, converter.ts, engine.ts
    fifo/engine.ts   — pure in-memory FIFO, buildPeriodBuckets, buildSpreadAnalysis
  proxy.ts           — Next.js 16 proxy (auth guard + session refresh)
scripts/
  seed-currencies.ts, migrate-wallets.ts, migrate-transactions.ts,
  migrate-clients.ts, get-org-id.ts
```

## Auth / Routing Logic

1. Unauthenticated → proxy redirects `/app/*` → `/login`
2. Authenticated, no org → app layout redirects → `/onboarding`
3. Onboarding is at `src/app/onboarding/` (NOT inside `src/app/app/`) — this is intentional.
   If it were inside `app/`, the app layout would redirect there → loop.
4. After org created → `/app/dashboard`

## Known Gotchas

- `redirect()` inside `try/catch` is swallowed. Re-throw when `err.digest?.startsWith("NEXT_REDIRECT")`.
- `created_by` / `user_id` columns store Supabase `auth.users` UUIDs — **no FK to public.users** (auth users don't exist in public schema; FK would violate on every insert).
- DB uses direct connection port **5432**, not pooler 6543 (pooler breaks DDL / Drizzle push).
- `drizzle.config.ts` must load `.env.local` via dotenv explicitly — drizzle-kit won't auto-load it.
- `sql` template references must use camelCase Drizzle column names (e.g. `transactions.organizationId`), not snake_case strings.

## Commands

```bash
PORT=3001 npm run dev        # start dev server
npm run build && npm start   # production
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint src
npx drizzle-kit push         # apply schema changes to Supabase
npx drizzle-kit studio       # browse DB in browser

# One-time v1 → v2 data migration
npx tsx scripts/get-org-id.ts
ORG_ID=<uuid> npm run migrate:wallets
ORG_ID=<uuid> npm run migrate:transactions
ORG_ID=<uuid> npm run migrate:clients
npm run seed:currencies
```

## Branch Strategy

- Feature branches `feat/iter-*` → merged to `dev` → merged to `main`
- `main` = production (Vercel)
- GitHub: `iborshchevskiy/acc-panel`

## Iteration Status (complete as of 2026-04-12)

All 8 iterations merged to main:
0. Foundation (Next.js, Supabase, Drizzle, auth, proxy, schema)
1. Core DB schema + seed currencies
2. Migration scripts from v1 CSV/JSON
3. Wallets page + import engine (Tron/EVM/SOL)
4. Transactions page + filters
5. Clients + FIFO engine
6. Analytics + Debts + Capital pages
7. Data Hub (CSV/JSON import/export)
8. Settings, polish, multi-tenant hardening

## v1 Data Source

`/Users/ilya/Documents/projects/acc_prog/`
- `all_wallets_master.csv` — master ledger (semicolon-delimited)
- `clients.json`, `tx_clients.json`, `tx_matched.json`, `wallets_whitelist`
