import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { currencies, orgTransactionTypes } from "@/db/schema/wallets";
import { eq, and, desc, ilike, or, sql, asc, inArray, isNull } from "drizzle-orm";
import ManualTransactionForm from "./ManualTransactionForm";
import TransactionFilters from "./TransactionFilters";
import { deleteTransaction } from "./actions";

const PAGE_SIZE = 50;

const TX_TYPE_COLORS: Record<string, string> = {
  Exchange: "var(--indigo)",
  Revenue: "var(--accent)",
  Expense: "var(--red)",
  Debt: "var(--amber)",
  Transfer: "var(--text-2)",
  Fee: "var(--violet)",
};

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string; type?: string; new?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const typeFilter = params.type ?? "";
  const showForm = params.new === "1";

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

  const [orgTxTypes, orgCurrencies] = await Promise.all([
    db.select({ name: orgTransactionTypes.name }).from(orgTransactionTypes)
      .where(eq(orgTransactionTypes.organizationId, orgId)).orderBy(asc(orgTransactionTypes.name)),
    db.select({ code: currencies.code }).from(currencies)
      .where(eq(currencies.organizationId, orgId)).orderBy(asc(currencies.code)),
  ]);

  // Build where conditions — always exclude soft-deleted records
  const conditions = [eq(transactions.organizationId, orgId), isNull(transactions.deletedAt)];
  if (typeFilter) conditions.push(eq(transactions.transactionType, typeFilter));
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

  // Distinct transaction types for filter
  const typeRows = await db
    .selectDistinct({ t: transactions.transactionType })
    .from(transactions)
    .where(and(eq(transactions.organizationId, orgId), sql`${transactions.transactionType} IS NOT NULL`))
    .orderBy(transactions.transactionType);
  const txTypes = typeRows.map((r) => r.t).filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Transactions</h1>
          <p className="text-sm text-slate-500">{count.toLocaleString()} total</p>
        </div>
        <a
          href={showForm ? "/app/transactions" : "/app/transactions?new=1"}
          className="h-8 flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors"
          style={{ backgroundColor: showForm ? "transparent" : "var(--green-btn-bg)", color: showForm ? "var(--text-2)" : "var(--accent)", border: showForm ? "1px solid var(--inner-border)" : "1px solid var(--green-btn-border)" }}
        >
          {showForm ? "Cancel" : "+ New"}
        </a>
      </div>

      {/* Manual entry form */}
      {showForm && (
        <ManualTransactionForm
          txTypes={orgTxTypes.map(t => t.name)}
          currencyCodes={orgCurrencies.map(c => c.code)}
        />
      )}

      {/* Filters */}
      <TransactionFilters q={q} typeFilter={typeFilter} txTypes={txTypes} />

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}
        >
          <span className="text-slate-500 text-sm">No transactions found</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--inner-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">In</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">TxID</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((tx, i) => {
                const txLegs = legsByTx.get(tx.id) ?? [];
                const inLeg = txLegs.find((l) => l.direction === "in");
                const outLeg = txLegs.find((l) => l.direction === "out");
                const isLast = i === rows.length - 1;
                const typeColor = tx.transactionType
                  ? (TX_TYPE_COLORS[tx.transactionType] ?? "var(--text-2)")
                  : "var(--text-2)";
                const explorerUrl = tx.txHash
                  ? `https://tronscan.org/#/transaction/${tx.txHash}`
                  : null;

                return (
                  <tr
                    key={tx.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      borderBottom: isLast ? "none" : "1px solid var(--inner-border)",
                    }}
                  >
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-3">
                      {tx.transactionType ? (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: typeColor + "22", color: typeColor }}
                        >
                          {tx.transactionType}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">{tx.type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {inLeg ? (
                        <div>
                          <span className="text-emerald-400">+{Number(inLeg.amount).toLocaleString()} {inLeg.currency}</span>
                          {inLeg.location && (
                            <div className="text-slate-600 text-xs mt-0.5">{inLeg.location.length > 14 ? `${inLeg.location.slice(0, 6)}…${inLeg.location.slice(-4)}` : inLeg.location}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {outLeg ? (
                        <div>
                          <span className="text-red-400">-{Number(outLeg.amount).toLocaleString()} {outLeg.currency}</span>
                          {outLeg.location && (
                            <div className="text-slate-600 text-xs mt-0.5">{outLeg.location.length > 14 ? `${outLeg.location.slice(0, 6)}…${outLeg.location.slice(-4)}` : outLeg.location}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">
                      {explorerUrl && tx.txHash ? (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-emerald-400 transition-colors"
                          title={tx.txHash}
                        >
                          {tx.txHash.slice(0, 8)}…
                        </a>
                      ) : (
                        <span className="text-slate-700">manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteTransaction}>
                        <input type="hidden" name="tx_id" value={tx.id} />
                        <button type="submit" className="text-xs text-slate-700 hover:text-red-400 transition-colors">×</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
