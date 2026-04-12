import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { clients, clientWallets, transactionClients } from "@/db/schema/clients";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, desc, sql } from "drizzle-orm";
import { updateClient, deleteClient, addClientWallet, removeClientWallet } from "../actions";

interface PageProps { params: Promise<{ id: string }> }

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const [client] = await db.select().from(clients)
    .where(and(eq(clients.id, id), eq(clients.organizationId, membership.organizationId))).limit(1);
  if (!client) notFound();

  const walletRows = await db.select().from(clientWallets).where(eq(clientWallets.clientId, id));

  // Transactions assigned to this client
  const txRows = await db
    .select({
      id: transactions.id,
      txHash: transactions.txHash,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
      type: transactions.type,
      location: transactions.location,
      isMatched: transactions.isMatched,
    })
    .from(transactions)
    .innerJoin(transactionClients, eq(transactionClients.transactionId, transactions.id))
    .where(and(
      eq(transactions.organizationId, membership.organizationId),
      eq(transactionClients.clientId, id)
    ))
    .orderBy(desc(transactions.timestamp))
    .limit(100);

  // Fetch legs for these transactions
  const txIds = txRows.map((r) => r.id);
  const legs = txIds.length > 0
    ? await db.select().from(transactionLegs)
        .where(sql`${transactionLegs.transactionId} = ANY(${sql.raw(`ARRAY[${txIds.map((i) => `'${i}'`).join(",")}]::uuid[]`)})`)
    : [];
  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            {client.name}{client.surname ? ` ${client.surname}` : ""}
          </h1>
          {client.tgUsername && (
            <p className="text-sm text-slate-500">@{client.tgUsername}</p>
          )}
        </div>
        <form action={deleteClient.bind(null, id)}>
          <button type="submit" className="text-xs text-slate-600 hover:text-red-400 transition-colors">
            Delete client
          </button>
        </form>
      </div>

      {/* Edit form */}
      <form action={updateClient.bind(null, id)}
        className="grid grid-cols-2 gap-3 rounded-xl p-4"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Name</label>
          <input name="name" defaultValue={client.name} required className="h-8 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Surname</label>
          <input name="surname" defaultValue={client.surname ?? ""} className="h-8 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Telegram</label>
          <input name="tg_username" defaultValue={client.tgUsername ?? ""} className="h-8 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Note</label>
          <input name="note" defaultValue={client.note ?? ""} className="h-8 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <div className="col-span-2 flex justify-end">
          <button type="submit" className="h-8 rounded-md px-4 text-sm font-medium"
            style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}>Save</button>
        </div>
      </form>

      {/* Linked wallets */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-slate-300">Counterparty wallets</h2>
        <form action={addClientWallet.bind(null, id)} className="flex gap-2">
          <input name="address" placeholder="Wallet address" required
            className="h-8 flex-1 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
          <select name="chain" className="h-8 rounded-md px-2 text-sm text-slate-200 outline-none" style={{ backgroundColor: "var(--inner-border)" }}>
            <option value="TRON">TRON</option>
            <option value="ETH">ETH</option>
            <option value="BNB">BNB</option>
            <option value="SOL">SOL</option>
          </select>
          <button type="submit" className="h-8 rounded-md px-3 text-sm font-medium"
            style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>Add</button>
        </form>
        {walletRows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {walletRows.map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
                style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
                <span className="font-mono text-slate-400">{w.address.slice(0, 8)}…{w.address.slice(-4)}</span>
                <span className="text-slate-600">{w.chain}</span>
                <form action={removeClientWallet.bind(null, w.id, id)}>
                  <button type="submit" className="text-slate-700 hover:text-red-400 transition-colors">×</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-slate-300">
          Transactions <span className="text-slate-600 font-normal">({txRows.length})</span>
        </h2>
        {txRows.length === 0 ? (
          <p className="text-sm text-slate-600">No transactions assigned to this client.</p>
        ) : (
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--inner-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">In</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Out</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Matched</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((tx, i) => {
                  const txLegs = legsByTx.get(tx.id) ?? [];
                  const inLeg = txLegs.find((l) => l.direction === "in");
                  const outLeg = txLegs.find((l) => l.direction === "out");
                  return (
                    <tr key={tx.id} style={{ backgroundColor: "var(--surface)", borderBottom: i < txRows.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{tx.transactionType ?? tx.type}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">
                        {inLeg ? <span className="text-emerald-400">+{Number(inLeg.amount).toLocaleString()} {inLeg.currency}</span> : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono">
                        {outLeg ? <span className="text-red-400">-{Number(outLeg.amount).toLocaleString()} {outLeg.currency}</span> : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span style={{ color: tx.isMatched ? "var(--accent)" : "var(--text-2)" }}>
                          {tx.isMatched ? "✓" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
