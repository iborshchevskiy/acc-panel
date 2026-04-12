import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { clients, clientWallets } from "@/db/schema/clients";
import { organizationMembers } from "@/db/schema/system";
import { eq, sql } from "drizzle-orm";
import { addClient } from "./actions";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      surname: clients.surname,
      tgUsername: clients.tgUsername,
      note: clients.note,
      createdAt: clients.createdAt,
      walletCount: sql<number>`count(${clientWallets.id})::int`,
    })
    .from(clients)
    .leftJoin(clientWallets, eq(clientWallets.clientId, clients.id))
    .where(eq(clients.organizationId, membership.organizationId))
    .groupBy(clients.id)
    .orderBy(clients.createdAt);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Clients</h1>
          <p className="text-sm text-slate-500">{rows.length} client{rows.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Add form */}
      <form action={addClient} className="flex flex-wrap gap-3 rounded-xl p-4"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
        <input name="name" required placeholder="Name" className="h-9 w-36 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <input name="surname" placeholder="Surname" className="h-9 w-36 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <input name="tg_username" placeholder="@telegram" className="h-9 w-36 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <input name="note" placeholder="Note" className="h-9 flex-1 min-w-48 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <button type="submit" className="h-9 rounded-md px-4 text-sm font-medium transition-colors"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}>Add client</button>
      </form>

      {/* List */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <span className="text-slate-500 text-sm">No clients yet</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--inner-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Telegram</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Wallets</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Note</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} style={{ backgroundColor: "var(--surface)", borderBottom: i < rows.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                  <td className="px-4 py-3">
                    <Link href={`/app/clients/${c.id}`} className="font-medium text-slate-200 hover:text-emerald-400 transition-colors">
                      {c.name}{c.surname ? ` ${c.surname}` : ""}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {c.tgUsername ? `@${c.tgUsername}` : <span className="text-slate-700">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs"
                      style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>
                      {c.walletCount} wallet{c.walletCount !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                    {c.note || <span className="text-slate-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
