import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { transactionClients, clients } from "@/db/schema/clients";
import { organizationMembers } from "@/db/schema/system";
import { eq, and } from "drizzle-orm";

interface DebtPosition {
  clientId: string;
  clientName: string;
  balances: Record<string, number>;
  txCount: number;
  oldestDate: string | null;
  ageDays: number;
}

export default async function DebtsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  // Fetch Debt transactions with legs and client in one join
  const rows = await db
    .select({
      txId: transactions.id,
      timestamp: transactions.timestamp,
      clientId: transactionClients.clientId,
      clientName: clients.name,
      clientSurname: clients.surname,
      direction: transactionLegs.direction,
      amount: transactionLegs.amount,
      currency: transactionLegs.currency,
    })
    .from(transactions)
    .innerJoin(transactionClients, eq(transactionClients.transactionId, transactions.id))
    .innerJoin(clients, eq(clients.id, transactionClients.clientId))
    .leftJoin(transactionLegs, eq(transactionLegs.transactionId, transactions.id))
    .where(and(
      eq(transactions.organizationId, orgId),
      eq(transactions.transactionType, "Debt")
    ));

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Debts</h1>
          <p className="text-sm text-slate-500">Debt positions per client</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <span className="text-slate-500 text-sm">No debt transactions found</span>
          <span className="text-slate-600 text-xs">Tag transactions as "Debt" type and assign to a client</span>
        </div>
      </div>
    );
  }

  const positions = new Map<string, DebtPosition>();
  const seenTxPerClient = new Map<string, Set<string>>();
  const today = new Date();

  for (const r of rows) {
    if (!r.clientId) continue;
    const clientId = r.clientId;
    const clientName = `${r.clientName}${r.clientSurname ? ` ${r.clientSurname}` : ""}`;

    if (!positions.has(clientId)) {
      positions.set(clientId, { clientId, clientName, balances: {}, txCount: 0, oldestDate: null, ageDays: 0 });
      seenTxPerClient.set(clientId, new Set());
    }
    const pos = positions.get(clientId)!;
    const seenTx = seenTxPerClient.get(clientId)!;

    if (!seenTx.has(r.txId)) {
      seenTx.add(r.txId);
      pos.txCount++;
      const dateStr = new Date(r.timestamp).toISOString().slice(0, 10);
      if (!pos.oldestDate || dateStr < pos.oldestDate) pos.oldestDate = dateStr;
    }

    if (r.direction && r.currency && r.amount) {
      const amt = parseFloat(r.amount as string);
      pos.balances[r.currency] = (pos.balances[r.currency] ?? 0) +
        (r.direction === "out" ? amt : -amt);
    }
  }

  for (const pos of positions.values()) {
    if (pos.oldestDate) {
      pos.ageDays = Math.floor((today.getTime() - new Date(pos.oldestDate).getTime()) / 86400000);
    }
  }

  const sorted = [...positions.values()].sort((a, b) => {
    const aOpen = Object.values(a.balances).some((v) => Math.abs(v) >= 0.001) ? 1 : 0;
    const bOpen = Object.values(b.balances).some((v) => Math.abs(v) >= 0.001) ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return a.clientName.localeCompare(b.clientName);
  });

  const openCount = sorted.filter((p) => Object.values(p.balances).some((v) => Math.abs(v) >= 0.001)).length;

  function ageBadge(days: number) {
    if (days > 90) return { label: "Overdue", color: "#ef4444" };
    if (days > 30) return { label: "Aging", color: "#f59e0b" };
    if (days > 7) return { label: "Recent", color: "#6366f1" };
    return { label: "Fresh", color: "#10b981" };
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Debts</h1>
        <p className="text-sm text-slate-500">{openCount} open · {sorted.length} total clients</p>
      </div>

      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #1e2432" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Client</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Net Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Since</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Txs</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos, i) => {
              const openBalances = Object.entries(pos.balances).filter(([, v]) => Math.abs(v) >= 0.001);
              const isSettled = openBalances.length === 0;
              const badge = ageBadge(pos.ageDays);
              return (
                <tr key={pos.clientId} style={{ backgroundColor: "#0d1117", borderBottom: i < sorted.length - 1 ? "1px solid #1e2432" : "none" }}>
                  <td className="px-4 py-3 font-medium text-slate-200">{pos.clientName}</td>
                  <td className="px-4 py-3">
                    {isSettled ? (
                      <span className="text-xs text-slate-600">Settled</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {openBalances.map(([cur, net]) => (
                          <span key={cur} className="text-xs font-mono"
                            style={{ color: net > 0 ? "#10b981" : "#ef4444" }}>
                            {net > 0 ? "+" : ""}{net.toLocaleString(undefined, { maximumFractionDigits: 2 })} {cur}
                            <span className="ml-1 text-slate-600 font-sans">
                              {net > 0 ? "(they owe us)" : "(we owe them)"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {pos.oldestDate ?? "—"}
                    {pos.ageDays > 0 && <span className="ml-1 text-slate-700">({pos.ageDays}d)</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 text-right">{pos.txCount}</td>
                  <td className="px-4 py-3">
                    {!isSettled && (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: badge.color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
                        {badge.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
