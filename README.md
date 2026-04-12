# AccPanel v2

P2P crypto trading accounting panel — rewrite of AccPanel v1 using TypeScript, Next.js 15, Supabase (PostgreSQL), and Drizzle ORM.

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL 15) |
| ORM | Drizzle ORM |
| Auth | Supabase Auth |
| UI | Tailwind CSS |
| Deploy | Vercel |
| Tests | Vitest + Playwright |

## Setup

```bash
npm install
cp .env.local.example .env.local  # fill in Supabase credentials
npm run db:push                    # apply schema to DB
npm run dev                        # → http://localhost:3000
```

## Scripts

```bash
npm run typecheck     # TypeScript strict check
npm run lint          # ESLint
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright e2e
npm run db:generate   # generate migrations from schema
npm run db:migrate    # apply migrations
npm run db:push       # push schema (dev only)
npm run db:studio     # Drizzle Studio
```

## Migration from v1

```bash
npx tsx scripts/migrate-transactions.ts --dry-run
npx tsx scripts/migrate-transactions.ts
```

See [MIGRATION_PLAN.md](../acc_prog/MIGRATION_PLAN.md) for full iteration plan.

## Iteration Status

| Iteration | Status |
|---|---|
| 0 — Foundation | 🔄 In progress |
| 1 — Auth | ⏳ |
| 2 — Wallets | ⏳ |
| 3 — Transaction migration | ⏳ |
| 4 — Import pipeline | ⏳ |
| 5 — Clients & matching | ⏳ |
| 6 — FIFO & analytics | ⏳ |
| 7 — Capital, debts, data hub | ⏳ |
| 8 — Polish & hardening | ⏳ |
