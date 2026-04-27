import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { clients, transactionClients } from "@/db/schema/clients";
import { organizationMembers } from "@/db/schema/system";
import { currencies, orgTransactionTypes } from "@/db/schema/wallets";
import { eq, and, desc, ilike, or, sql, asc, inArray, isNull } from "drizzle-orm";
import ManualTransactionForm from "./ManualTransactionForm";
import TransactionFilters from "./TransactionFilters";
import { type ClientOption } from "./ClientPicker";
import TransactionTable from "./TransactionTable";

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string; type?: string; new?: string; tx?: string; review?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const typeFilter = params.type ?? "";
  const showForm = params.new === "1";
  const txId = params.tx ?? "";
  const reviewOnly = params.review === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);

  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  const [orgTxTypes, orgCurrencies, orgClients] = await Promise.all([
    db.select({ name: orgTransactionTypes.name }).from(orgTransactionTypes)
      .where(eq(orgTransactionTypes.organizationId, orgId)).orderBy(asc(orgTransactionTypes.name)),
    db.select({ code: currencies.code, usageCount: sql<number>`count(${transactionLegs.id})::int` })
      .from(currencies)
      .leftJoin(transactionLegs, eq(transactionLegs.currency, currencies.code))
      .where(eq(currencies.organizationId, orgId))
      .groupBy(currencies.code)
      .orderBy(sql`count(${transactionLegs.id}) desc`, asc(currencies.code)),
    db.select({
      id: clients.id,
      name: clients.name,
      surname: clients.surname,
      tgUsername: clients.tgUsername,
    }).from(clients)
      .where(eq(clients.organizationId, orgId))
      .orderBy(asc(clients.name)),
  ]);

  // Build where conditions — always exclude soft-deleted records
  const conditions = [eq(transactions.organizationId, orgId), isNull(transactions.deletedAt)];
  if (txId) conditions.push(eq(transactions.id, txId));
  if (typeFilter) conditions.push(eq(transactions.transactionType, typeFilter));
  if (reviewOnly) {
    // Mirror the REVIEW badge logic in TransactionTable.tsx — Trade with no
    // user-set type (or one that's no longer in the org's list), no status,
    // and no client assignment.
    conditions.push(
      eq(transactions.type, "Trade"),
      isNull(transactions.status),
      sql`(${transactions.transactionType} IS NULL
           OR ${transactions.transactionType} NOT IN (
             SELECT name FROM org_transaction_types
             WHERE organization_id = ${orgId}
           ))`,
      sql`NOT EXISTS (
            SELECT 1 FROM transaction_clients tc
            WHERE tc.transaction_id = ${transactions.id}
          )`
    );
  }
  if (q) {
    const p = `%${q}%`;
    // Search both transaction fields AND leg fields (currency, wallet address)
    // EXISTS subquery avoids duplicate rows that a JOIN would produce
    conditions.push(
      or(
        ilike(transactions.txHash, p),
        ilike(transactions.location, p),
        ilike(transactions.comment, p),
        ilike(transactions.fromAddress, p),
        ilike(transactions.toAddress, p),
        sql`EXISTS (
          SELECT 1 FROM transaction_legs tl
          WHERE tl.transaction_id = ${transactions.id}
            AND (tl.location ILIKE ${p} OR tl.currency ILIKE ${p})
        )`
      )!
    );
  }

  const where = and(...conditions);

  // Total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch page
  const rows = await db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.timestamp))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Fetch legs for these transactions
  const txIds = rows.map((r) => r.id);
  const legs =
    txIds.length > 0
      ? await db.select().from(transactionLegs).where(inArray(transactionLegs.transactionId, txIds))
      : [];

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  // Fetch client assignments for this page
  const txClientRows = txIds.length > 0
    ? await db
        .select({
          transactionId: transactionClients.transactionId,
          clientId: clients.id,
          name: clients.name,
          surname: clients.surname,
          tgUsername: clients.tgUsername,
        })
        .from(transactionClients)
        .innerJoin(clients, eq(clients.id, transactionClients.clientId))
        .where(inArray(transactionClients.transactionId, txIds))
    : [];

  const clientByTx = new Map<string, ClientOption>();
  for (const r of txClientRows) {
    clientByTx.set(r.transactionId, { id: r.clientId, name: r.name, surname: r.surname, tgUsername: r.tgUsername });
  }

  // Distinct transaction types for filter
  const typeRows = await db
    .selectDistinct({ t: transactions.transactionType })
    .from(transactions)
    .where(and(eq(transactions.organizationId, orgId), sql`${transactions.transactionType} IS NOT NULL`))
    .orderBy(transactions.transactionType);
  const txTypes = typeRows.map((r) => r.t).filter(Boolean) as string[];

  const newHref = showForm
    ? `/app/transactions${q || typeFilter || page > 1 ? `?${[page > 1 ? `page=${page}` : "", q ? `q=${encodeURIComponent(q)}` : "", typeFilter ? `type=${encodeURIComponent(typeFilter)}` : ""].filter(Boolean).join("&")}` : ""}`
    : `/app/transactions?new=1${q ? `&q=${encodeURIComponent(q)}` : ""}${typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : ""}`;

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-100">Transactions</h1>
          <p className="text-sm text-slate-500">
            {count.toLocaleString()} {reviewOnly ? "under review" : "total"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reviewOnly && (
            <a href="/app/transactions"
              className="h-8 flex items-center gap-1.5 rounded-full pl-2 pr-2.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--amber) 12%, transparent)",
                color: "var(--amber)",
                border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)",
              }}
            >
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                  style={{ backgroundColor: "var(--amber)" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5"
                  style={{ backgroundColor: "var(--amber)" }} />
              </span>
              Under review
              <span className="ml-1 opacity-70">×</span>
            </a>
          )}
          <a href={newHref}
            className="h-8 flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors"
            style={{ backgroundColor: showForm ? "transparent" : "var(--green-btn-bg)", color: showForm ? "var(--text-2)" : "var(--accent)", border: showForm ? "1px solid var(--inner-border)" : "1px solid var(--green-btn-border)" }}
          >
            {showForm ? "Cancel" : "+ New"}
          </a>
        </div>
      </div>

      {/* Manual entry form */}
      {showForm && (
        <ManualTransactionForm
          txTypes={orgTxTypes.map(t => t.name)}
          currencyCodes={orgCurrencies.map(c => c.code)}
          clients={orgClients}
        />
      )}

      {/* Filter bar + Table fused in one card */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
        <TransactionFilters
          key={`${q}|${typeFilter}`}
          q={q}
          typeFilter={typeFilter}
          txTypes={txTypes}
          total={count}
        />
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16"
            style={{ backgroundColor: "var(--surface)" }}>
            <span className="text-slate-500 text-sm">No transactions found</span>
          </div>
        ) : (
          <TransactionTable
            rows={rows.map((r) => ({
              id: r.id,
              timestamp: r.timestamp.toISOString(),
              transactionType: r.transactionType,
              type: r.type,
              txHash: r.txHash,
              comment: r.comment,
              status: r.status,
              isMatched: r.isMatched,
            }))}
            legs={legs.map((l) => ({
              id: l.id,
              transactionId: l.transactionId,
              direction: l.direction,
              amount: l.amount != null ? String(l.amount) : null,
              currency: l.currency,
              location: l.location,
            }))}
            clientByTx={Object.fromEntries(clientByTx)}
            txTypes={orgTxTypes.map((t) => t.name)}
            orgClients={orgClients}
            currencyCodes={orgCurrencies.map((c) => c.code)}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            {page > 1 && (
              <a
                href={`?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : ""}`}
                className="h-7 px-3 flex items-center rounded text-xs text-slate-400 hover:bg-white/5 transition-colors"
              >
                ← Prev
              </a>
            )}
            {page < totalPages && (
              <a
                href={`?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : ""}`}
                className="h-7 px-3 flex items-center rounded text-xs text-slate-400 hover:bg-white/5 transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
