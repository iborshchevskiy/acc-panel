import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { organizations, organizationMembers, auditLogs } from "@/db/schema/system";
import { transactions } from "@/db/schema/transactions";
import { wallets, importTargets } from "@/db/schema/wallets";
import { eq, and, desc, sql } from "drizzle-orm";

interface PageProps { params: Promise<{ id: string }> }

export default async function AdminOrgDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) notFound();

  const [members, , walletRows, recentLogs, [{ txCount }]] = await Promise.all([
    db.select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      email: organizationMembers.email,
      role: organizationMembers.role,
      acceptedAt: organizationMembers.acceptedAt,
      createdAt: organizationMembers.createdAt,
    }).from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, id), eq(organizationMembers.isActive, true))),

    db.select({ id: transactions.id, timestamp: transactions.timestamp, type: transactions.type, transactionType: transactions.transactionType })
      .from(transactions)
      .where(eq(transactions.organizationId, id))
      .orderBy(desc(transactions.timestamp))
      .limit(5),

    db.select({
      id: wallets.id, address: wallets.address, chain: wallets.chain, label: wallets.label,
      syncStatus: importTargets.syncStatus, txCount: importTargets.txCount,
    })
      .from(wallets)
      .leftJoin(importTargets, eq(importTargets.walletId, wallets.id))
      .where(and(eq(wallets.organizationId, id), eq(wallets.isActive, true))),

    db.select().from(auditLogs).where(eq(auditLogs.organizationId, id)).orderBy(desc(auditLogs.createdAt)).limit(20),

    db.select({ txCount: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.organizationId, id)),
  ]);

  const ROLE_COLOR: Record<string, string> = { org_admin: "var(--accent)", accountant: "var(--blue)", viewer: "var(--text-5)" };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>{org.name}</h1>
          <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>{org.id}</p>
        </div>
        <div className="flex gap-4 text-xs" style={{ color: "var(--text-4)" }}>
          <span>slug: <span className="font-mono text-slate-400">{org.slug}</span></span>
          <span>currency: <span className="font-mono" style={{ color: "var(--amber)" }}>{org.baseCurrency}</span></span>
          <span>tz: <span className="font-mono text-slate-400">{org.timezone}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Transactions", value: txCount.toLocaleString(), color: "var(--accent)" },
          { label: "Members", value: members.length, color: "var(--indigo)" },
          { label: "Wallets", value: walletRows.length, color: "var(--amber)" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl p-4" style={{ backgroundColor: "#0d0505", border: `1px solid ${c.color}22` }}>
            <p className="text-xs" style={{ color: "var(--text-4)" }}>{c.label}</p>
            <p className="mt-1 text-2xl font-semibold font-mono" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Members */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
          <h2 className="text-xs font-medium tracking-wide" style={{ color: "var(--red)" }}>MEMBERS</h2>
        </div>
        <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-5)" }}>{m.email ?? m.userId.slice(0, 12) + "…"}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: ROLE_COLOR[m.role] ?? "var(--text-5)", backgroundColor: (ROLE_COLOR[m.role] ?? "var(--text-5)") + "22" }}>{m.role}</span>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--inner-border)" }}>{m.userId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wallets */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
          <h2 className="text-xs font-medium tracking-wide" style={{ color: "var(--red)" }}>WALLETS</h2>
        </div>
        <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
          <tbody>
            {walletRows.map((w, i) => (
              <tr key={w.id} style={{ borderBottom: i < walletRows.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--indigo)" }}>{w.chain}</td>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--text-4)" }}>{w.address.slice(0, 10)}…{w.address.slice(-6)}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-5)" }}>{w.label ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: w.syncStatus === "done" ? "var(--accent)" : w.syncStatus === "error" ? "var(--red)" : "var(--text-2)" }}>{w.syncStatus ?? "idle"}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-right" style={{ color: "var(--text-3)" }}>{(w.txCount ?? 0).toLocaleString()} txs</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent audit log */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
          <h2 className="text-xs font-medium tracking-wide" style={{ color: "var(--red)" }}>RECENT AUDIT (last 20)</h2>
        </div>
        <div className="divide-y" style={{ borderColor: "#1a0a0a" }}>
          {recentLogs.length === 0
            ? <p className="px-4 py-4 text-xs" style={{ color: "var(--text-3)" }}>No audit events.</p>
            : recentLogs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex gap-4">
                <span className="text-xs font-mono shrink-0" style={{ color: "var(--inner-border)" }}>
                  {new Date(log.createdAt).toLocaleString()}
                </span>
                <span className="text-xs" style={{ color: "var(--text-5)" }}>{log.action}</span>
                <span className="text-xs truncate" style={{ color: "var(--text-4)" }}>{log.userEmail ?? log.userId?.slice(0, 8)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
