import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets } from "@/db/schema/wallets";
import { clients } from "@/db/schema/clients";
import { organizationMembers, organizations } from "@/db/schema/system";
import { eq, desc, sql, inArray } from "drizzle-orm";

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
    .where(inArray(transactionLegs.transactionId, recentIds))
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
        <h1 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>{org?.name ?? "Dashboard"}</h1>
        <p className="text-sm" style={{ color: "#334155" }}>Overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}
            className="rounded-xl p-5 transition-all hover:translate-y-[-1px]"
            style={{ backgroundColor: "#0d1117", border: "1px solid #1a2433", borderTop: `2px solid ${s.color}` }}>
            <p className="text-xs font-medium tracking-wide" style={{ color: "#475569" }}>{s.label.toUpperCase()}</p>
            <p className="mt-3 font-[family-name:var(--font-ibm-plex-mono)] text-4xl font-medium leading-none"
              style={{ color: s.color }}>{s.value}</p>
          </Link>
        ))}
      </div>

      {/* Volume */}
      {volumeRows.length > 0 && (
        <div className="rounded-xl p-5" style={{ backgroundColor: "#0d1117", border: "1px solid #1a2433" }}>
          <p className="text-xs font-medium tracking-wide mb-4" style={{ color: "#475569" }}>ALL-TIME INCOME VOLUME</p>
          <div className="flex flex-wrap gap-8">
            {volumeRows.map((v) => (
              <div key={v.currency} className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium" style={{ color: "#10b981" }}>
                  {parseFloat(v.total ?? "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-mono font-medium" style={{ color: "#475569" }}>{v.currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {recent.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a2433" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "#0d1117", borderBottom: "1px solid #1a2433" }}>
            <h2 className="text-xs font-medium tracking-wide" style={{ color: "#475569" }}>RECENT TRANSACTIONS</h2>
            <Link href="/app/transactions" className="text-xs transition-colors" style={{ color: "#334155" }}>View all →</Link>
          </div>
          <table className="w-full text-sm" style={{ backgroundColor: "#07090c" }}>
            <tbody>
              {recent.map((tx, i) => {
                const legs = legsByTx.get(tx.id) ?? [];
                const inLeg = legs.find((l) => l.direction === "in");
                const outLeg = legs.find((l) => l.direction === "out");
                return (
                  <tr key={tx.id} style={{ borderBottom: i < recent.length - 1 ? "1px solid #1a2433" : "none" }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: "#334155", whiteSpace: "nowrap" }}>
                      {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>{tx.transactionType ?? tx.type}</td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {inLeg && <span style={{ color: "#10b981" }}>+{Number(inLeg.amount).toLocaleString()} {inLeg.currency}</span>}
                      {inLeg && outLeg && <span className="mx-1.5" style={{ color: "#1a2433" }}>/</span>}
                      {outLeg && <span style={{ color: "#f87171" }}>-{Number(outLeg.amount).toLocaleString()} {outLeg.currency}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: "#1e293b" }}>
                      {tx.location ? `${tx.location.slice(0, 6)}…${tx.location.slice(-4)}` : ""}
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
