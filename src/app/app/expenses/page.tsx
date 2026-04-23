import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { clients, transactionClients } from "@/db/schema/clients";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, desc, isNull, inArray, asc, sql } from "drizzle-orm";
import type { ClientOption } from "../transactions/ClientPicker";
import ExpenseForm from "./ExpenseForm";

export default async function ExpensesPage() {
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

  // Currencies sorted by usage
  const orgCurrencies = await db
    .select({ code: currencies.code })
    .from(currencies)
    .leftJoin(transactionLegs, eq(transactionLegs.currency, currencies.code))
    .where(eq(currencies.organizationId, orgId))
    .groupBy(currencies.code)
    .orderBy(sql`count(${transactionLegs.id}) desc`, asc(currencies.code));

  // Clients
  const orgClients = await db
    .select({ id: clients.id, name: clients.name, surname: clients.surname, tgUsername: clients.tgUsername })
    .from(clients)
    .where(eq(clients.organizationId, orgId))
    .orderBy(asc(clients.name));

  // Expenses = transactions with transactionType = 'Expense'
  const rows = await db
    .select()
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, orgId),
      eq(transactions.transactionType, "Expense"),
      isNull(transactions.deletedAt),
    ))
    .orderBy(desc(transactions.timestamp))
    .limit(200);

  const txIds = rows.map((r) => r.id);

  const legs = txIds.length > 0
    ? await db.select().from(transactionLegs).where(inArray(transactionLegs.transactionId, txIds))
    : [];

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  const txClientRows = txIds.length > 0
    ? await db
        .select({ transactionId: transactionClients.transactionId, id: clients.id, name: clients.name, surname: clients.surname })
        .from(transactionClients)
        .innerJoin(clients, eq(clients.id, transactionClients.clientId))
        .where(inArray(transactionClients.transactionId, txIds))
    : [];

  const clientByTx = new Map<string, ClientOption>();
  for (const r of txClientRows) {
    clientByTx.set(r.transactionId, { id: r.id, name: r.name, surname: r.surname, tgUsername: null });
  }

  // MTD total
  const now = new Date();
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mtdRows = rows.filter((r) => new Date(r.timestamp) >= mtdStart);
  const mtdByLeg = legs.filter((l) => mtdRows.some((r) => r.id === l.transactionId) && l.direction === "out");
  const mtdByCurrency: Record<string, number> = {};
  for (const l of mtdByLeg) {
    const cur = l.currency ?? "?";
    mtdByCurrency[cur] = (mtdByCurrency[cur] ?? 0) + parseFloat(l.amount ?? "0");
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Expenses</h1>
          <p className="text-sm text-slate-500">{rows.length} total</p>
        </div>
        {Object.keys(mtdByCurrency).length > 0 && (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs" style={{ color: "var(--text-3)" }}>This month</span>
            <div className="flex gap-3">
              {Object.entries(mtdByCurrency).slice(0, 3).map(([cur, amt]) => (
                <span key={cur} className="text-sm font-mono font-semibold" style={{ color: "var(--red)" }}>
                  -{amt.toLocaleString(undefined, { maximumFractionDigits: 2 })} {cur}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add form */}
      <ExpenseForm
        currencyCodes={orgCurrencies.map((c) => c.code)}
        clients={orgClients}
      />

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <span className="text-slate-500 text-sm">No expenses yet</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--inner-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Account</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Client</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((tx, i) => {
                const txLegs = legsByTx.get(tx.id) ?? [];
                const outLeg = txLegs.find((l) => l.direction === "out");
                const client = clientByTx.get(tx.id);
                const isLast = i === rows.length - 1;

                return (
                  <tr key={tx.id} style={{
                    backgroundColor: "var(--surface)",
                    borderBottom: isLast ? "none" : "1px solid var(--inner-border)",
                  }}>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {outLeg ? (
                        <span style={{ color: "var(--red)" }}>
                          -{Number(outLeg.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {outLeg.currency}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {outLeg?.location ? (
                        outLeg.location.length > 16
                          ? `${outLeg.location.slice(0, 6)}…${outLeg.location.slice(-4)}`
                          : outLeg.location
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {tx.comment ?? <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {client ? (
                        <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5"
                          style={{ backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }}>
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
                            style={{ backgroundColor: "rgba(96,165,250,.25)" }}>
                            {client.name[0]?.toUpperCase()}
                          </span>
                          {client.name}{client.surname ? ` ${client.surname}` : ""}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/app/transactions?edit=${tx.id}`}
                        className="text-xs transition-colors hover:opacity-70"
                        style={{ color: "var(--text-3)" }}>
                        edit
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
