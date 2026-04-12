import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets } from "@/db/schema/wallets";
import { clients } from "@/db/schema/clients";
import { organizationMembers, organizations } from "@/db/schema/system";
import { eq, desc, sql } from "drizzle-orm";

export const metadata = { title: "Dashboard — AccPanel" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  const [org] = await db.select({ name: organizations.name }).from(organizations)
    .where(eq(organizations.id, orgId)).limit(1);

  // Counts
  const [[{ txCount }], [{ walletCount }], [{ clientCount }]] = await Promise.all([
    db.select({ txCount: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.organizationId, orgId)),
    db.select({ walletCount: sql<number>`count(*)::int` }).from(wallets).where(eq(wallets.organizationId, orgId)),
    db.select({ clientCount: sql<number>`count(*)::int` }).from(clients).where(eq(clients.organizationId, orgId)),
  ]);

  // Recent transactions
  const recent = await db
    .select({
      id: transactions.id,
      txHash: transactions.txHash,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
      type: transactions.type,
      location: transactions.location,
    })
    .from(transactions)
    .where(eq(transactions.organizationId, orgId))
    .orderBy(desc(transactions.timestamp))
    .limit(5);

  const recentIds = recent.map((r) => r.id);
  const recentLegs = recentIds.length > 0 ? await db
    .select({ transactionId: transactionLegs.transactionId, direction: transactionLegs.direction, amount: transactionLegs.amount, currency: transactionLegs.currency })
    .from(transactionLegs)
    .where(sql`${transactionLegs.transactionId} = ANY(ARRAY[${sql.raw(recentIds.map((id) => `'${id}'`).join(","))}]::uuid[])`)
    : [];

  const legsByTx = new Map<string, typeof recentLegs>();
  for (const l of recentLegs) {
    const arr = legsByTx.get(l.transactionId) ?? [];
    arr.push(l);
    legsByTx.set(l.transactionId, arr);
  }

  // Volume (sum of all income legs, exclude Transfer)
  const volumeRows = await db
    .select({ currency: transactionLegs.currency, total: sql<string>`SUM(${transactionLegs.amount}::numeric)` })
    .from(transactionLegs)
    .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
    .where(sql`${transactions.organizationId} = ${orgId} AND ${transactionLegs.direction} = 'in' AND ${transactions.transactionType} != 'Transfer'`)
    .groupBy(transactionLegs.currency)
    .orderBy(sql`SUM(${transactionLegs.amount}::numeric) DESC`)
    .limit(3);

  const stats = [
    { label: "Transactions", value: txCount.toLocaleString(), href: "/app/transactions", color: "#10b981" },
    { label: "Wallets", value: walletCount.toLocaleString(), href: "/app/wallets", color: "#6366f1" },
    { label: "Clients", value: clientCount.toLocaleString(), href: "/app/clients", color: "#f59e0b" },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">{org?.name ?? "Dashboard"}</h1>
        <p className="text-sm text-slate-500">Overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}
            className="rounded-xl p-5 transition-colors hover:border-opacity-50"
            style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-2 font-[family-name:var(--font-ibm-plex-mono)] text-3xl font-medium"
              style={{ color: s.color }}>{s.value}</p>
          </Link>
        ))}
      </div>

      {/* Volume */}
      {volumeRows.length > 0 && (
        <div className="rounded-xl p-5" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <p className="text-xs text-slate-500 mb-3">All-time income volume</p>
          <div className="flex flex-wrap gap-6">
            {volumeRows.map((v) => (
              <div key={v.currency}>
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xl font-medium text-slate-100">
                  {parseFloat(v.total ?? "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="ml-1.5 text-sm text-slate-500">{v.currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {recent.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1e2432" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
            <h2 className="text-sm font-medium text-slate-300">Recent transactions</h2>
            <Link href="/app/transactions" className="text-xs text-slate-500 hover:text-emerald-400 transition-colors">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {recent.map((tx, i) => {
                const legs = legsByTx.get(tx.id) ?? [];
                const inLeg = legs.find((l) => l.direction === "in");
                const outLeg = legs.find((l) => l.direction === "out");
                return (
                  <tr key={tx.id} style={{ backgroundColor: "#0d1117", borderBottom: i < recent.length - 1 ? "1px solid #1e2432" : "none" }}>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{tx.transactionType ?? tx.type}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      {inLeg && <span className="text-emerald-400">+{Number(inLeg.amount).toLocaleString()} {inLeg.currency}</span>}
                      {inLeg && outLeg && <span className="mx-1 text-slate-700">/</span>}
                      {outLeg && <span className="text-red-400">-{Number(outLeg.amount).toLocaleString()} {outLeg.currency}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-600">
                      {tx.location ? `${tx.location.slice(0, 6)}…${tx.location.slice(-4)}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {txCount === 0 && (
        <div className="rounded-xl p-6" style={{ backgroundColor: "#161b27", border: "1px solid rgba(16,185,129,0.25)" }}>
          <h2 className="text-sm font-semibold text-slate-100">Import your data</h2>
          <p className="mt-1 text-sm text-slate-400">Bring in your existing master CSV from AccPanel v1.</p>
          <Link href="/app/data" className="mt-3 inline-flex h-8 items-center rounded-md px-4 text-sm font-medium"
            style={{ backgroundColor: "#10b981", color: "#0d1117" }}>Go to Data Hub</Link>
        </div>
      )}
    </div>
  );
}
