import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { transactionClients, clients } from "@/db/schema/clients";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";

interface PageProps { params: Promise<{ clientId: string }> }

const TX_TYPE_COLORS: Record<string, string> = {
  Exchange:   "var(--indigo)",
  Debt:       "var(--amber)",
  Withdrawal: "var(--red)",
  Deposit:    "var(--accent)",
  Transfer:   "var(--text-3)",
};

export default async function DebtClientPage({ params }: PageProps) {
  const { clientId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  const [client] = await db.select().from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId))).limit(1);
  if (!client) notFound();

  const clientName = `${client.name}${client.surname ? ` ${client.surname}` : ""}`;

  // All transactions assigned to this client (any type), org-scoped, not deleted
  const txRows = await db
    .select({
      id: transactions.id,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
      location: transactions.location,
      comment: transactions.comment,
      txHash: transactions.txHash,
    })
    .from(transactions)
    .innerJoin(transactionClients, eq(transactionClients.transactionId, transactions.id))
    .where(and(
      eq(transactions.organizationId, orgId),
      eq(transactionClients.clientId, clientId),
      isNull(transactions.deletedAt),
    ))
    .orderBy(desc(transactions.timestamp));

  const txIds = txRows.map((r) => r.id);
  const legs = txIds.length > 0
    ? await db.select().from(transactionLegs)
        .where(inArray(transactionLegs.transactionId, txIds))
    : [];

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  // Running balance across all Debt transactions
  const runningBalance: Record<string, number> = {};
  const debtTxIds = new Set(txRows.filter((r) => r.transactionType === "Debt").map((r) => r.id));
  for (const leg of legs) {
    if (!debtTxIds.has(leg.transactionId)) continue;
    if (!leg.currency || !leg.amount || !leg.direction) continue;
    const amt = parseFloat(leg.amount as string);
    runningBalance[leg.currency] = (runningBalance[leg.currency] ?? 0) +
      (leg.direction === "out" ? amt : -amt);
  }

  const openEntries = Object.entries(runningBalance)
    .filter(([, v]) => Math.abs(v) >= 0.001)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const allBalanceEntries = Object.entries(runningBalance)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/debts"
          className="text-xs px-2.5 py-1 rounded-md transition-colors"
          style={{ color: "var(--text-4)", border: "1px solid var(--inner-border)", backgroundColor: "var(--raised-hi)" }}>
          ← Debts
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">{clientName}</h1>
          <p className="text-sm text-slate-500">{txRows.length} transactions total</p>
        </div>
      </div>

      {/* Balance summary */}
      {allBalanceEntries.length > 0 && (
        <div className="rounded-xl p-4 flex flex-wrap gap-6"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <div>
            <p className="text-xs text-slate-500 mb-2">Net Debt Balance</p>
            <div className="flex flex-wrap gap-4">
              {allBalanceEntries.map(([cur, net]) => {
                const settled = Math.abs(net) < 0.001;
                return (
                  <div key={cur} className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{cur}</span>
                    <span className="text-base font-mono font-semibold"
                      style={{ color: settled ? "var(--text-4)" : net > 0 ? "var(--accent)" : "var(--red)" }}>
                      {settled ? "0" : `${net > 0 ? "+" : ""}${net.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                    </span>
                    {!settled && (
                      <span className="text-[10px] text-slate-600">
                        {net > 0 ? "they owe us" : "we owe them"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {openEntries.length === 0 && (
            <div className="flex items-center">
              <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--accent-dim)", color: "var(--accent)" }}>
                Fully settled
              </span>
            </div>
          )}
        </div>
      )}

      {/* Transaction history */}
      {txRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <span className="text-slate-500 text-sm">No transactions with this client</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--inner-border)" }}>
          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col" style={{ backgroundColor: "var(--surface)" }}>
            {txRows.map((tx, i) => {
              const txLegs = legsByTx.get(tx.id) ?? [];
              const ins  = txLegs.filter((l) => l.direction === "in");
              const outs = txLegs.filter((l) => l.direction === "out");
              const typeColor = TX_TYPE_COLORS[tx.transactionType ?? ""] ?? "var(--text-3)";
              return (
                <Link key={tx.id} href={`/app/transactions?tx=${tx.id}`}
                  className="px-4 py-3 flex flex-col gap-1.5 active:opacity-70"
                  style={{ borderBottom: i < txRows.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(tx.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    <span className="text-xs font-medium" style={{ color: typeColor }}>
                      {tx.transactionType ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs font-mono">
                    {outs.map((l, j) => (
                      <span key={`out-${j}`} style={{ color: "var(--red)" }}>
                        −{parseFloat(l.amount as string).toLocaleString(undefined, { maximumFractionDigits: 4 })} {l.currency}
                      </span>
                    ))}
                    {ins.map((l, j) => (
                      <span key={`in-${j}`} style={{ color: "var(--accent)" }}>
                        +{parseFloat(l.amount as string).toLocaleString(undefined, { maximumFractionDigits: 4 })} {l.currency}
                      </span>
                    ))}
                    {txLegs.length === 0 && <span className="text-slate-600">—</span>}
                  </div>
                  {(tx.location || tx.comment) && (
                    <div className="text-[11px] text-slate-500 flex flex-col gap-0.5">
                      {tx.location && <span>{tx.location}</span>}
                      {tx.comment && <span className="truncate">{tx.comment}</span>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Amounts</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Note</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500" />
              </tr>
            </thead>
            <tbody>
              {txRows.map((tx, i) => {
                const txLegs = legsByTx.get(tx.id) ?? [];
                const ins  = txLegs.filter((l) => l.direction === "in");
                const outs = txLegs.filter((l) => l.direction === "out");
                const typeColor = TX_TYPE_COLORS[tx.transactionType ?? ""] ?? "var(--text-3)";
                return (
                  <tr key={tx.id}
                    style={{ backgroundColor: "var(--surface)", borderBottom: i < txRows.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium" style={{ color: typeColor }}>
                        {tx.transactionType ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {outs.map((l, j) => (
                          <span key={`out-${j}`} className="text-xs font-mono" style={{ color: "var(--red)" }}>
                            −{parseFloat(l.amount as string).toLocaleString(undefined, { maximumFractionDigits: 4 })} {l.currency}
                          </span>
                        ))}
                        {ins.map((l, j) => (
                          <span key={`in-${j}`} className="text-xs font-mono" style={{ color: "var(--accent)" }}>
                            +{parseFloat(l.amount as string).toLocaleString(undefined, { maximumFractionDigits: 4 })} {l.currency}
                          </span>
                        ))}
                        {txLegs.length === 0 && <span className="text-xs text-slate-600">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{tx.location ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{tx.comment ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/app/transactions?tx=${tx.id}`}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors whitespace-nowrap"
                        style={{ color: "var(--text-3)", border: "1px solid var(--inner-border)", backgroundColor: "var(--raised-hi)" }}
                        title="Open this transaction in the Transactions list"
                      >
                        View
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                          <path d="M2 7L7 2M7 2H3.5M7 2V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
