import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";

const PAGE_SIZE = 50;

const TX_TYPE_COLORS: Record<string, string> = {
  Exchange: "#6366f1",
  Revenue: "#10b981",
  Expense: "#ef4444",
  Debt: "#f59e0b",
  Transfer: "#64748b",
  Fee: "#8b5cf6",
};

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string; type?: string }>;
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const q = params.q ?? "";
  const typeFilter = params.type ?? "";

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

  // Build where conditions
  const conditions = [eq(transactions.organizationId, orgId)];
  if (typeFilter) conditions.push(eq(transactions.transactionType, typeFilter));
  if (q) {
    conditions.push(
      or(
        ilike(transactions.txHash, `%${q}%`),
        ilike(transactions.location, `%${q}%`),
        ilike(transactions.comment, `%${q}%`),
        ilike(transactions.fromAddress, `%${q}%`),
        ilike(transactions.toAddress, `%${q}%`)
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
      ? await db
          .select()
          .from(transactionLegs)
          .where(sql`${transactionLegs.transactionId} = ANY(${sql.raw(`ARRAY[${txIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`)
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
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search TxID, address, comment…"
          className="h-8 flex-1 min-w-56 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <select
          name="type"
          defaultValue={typeFilter}
          className="h-8 rounded-md px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
          style={{ backgroundColor: "#1e2432" }}
        >
          <option value="">All types</option>
          {txTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 rounded-md px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5"
        >
          Filter
        </button>
        {(q || typeFilter) && (
          <a href="/app/transactions" className="h-8 flex items-center rounded-md px-3 text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}
        >
          <span className="text-slate-500 text-sm">No transactions found</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #1e2432" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">In</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">TxID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx, i) => {
                const txLegs = legsByTx.get(tx.id) ?? [];
                const inLeg = txLegs.find((l) => l.direction === "in");
                const outLeg = txLegs.find((l) => l.direction === "out");
                const isLast = i === rows.length - 1;
                const typeColor = tx.transactionType
                  ? (TX_TYPE_COLORS[tx.transactionType] ?? "#64748b")
                  : "#64748b";
                const explorerUrl = tx.txHash
                  ? `https://tronscan.org/#/transaction/${tx.txHash}`
                  : null;

                return (
                  <tr
                    key={tx.id}
                    style={{
                      backgroundColor: "#0d1117",
                      borderBottom: isLast ? "none" : "1px solid #1e2432",
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
                        <span className="text-emerald-400">
                          +{Number(inLeg.amount).toLocaleString()} {inLeg.currency}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {outLeg ? (
                        <span className="text-red-400">
                          -{Number(outLeg.amount).toLocaleString()} {outLeg.currency}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">
                      {tx.location
                        ? `${tx.location.slice(0, 6)}…${tx.location.slice(-4)}`
                        : <span className="text-slate-700">—</span>}
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
