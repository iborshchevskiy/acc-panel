import { db } from "@/db/client";
import { organizations, organizationMembers } from "@/db/schema/system";
import { transactions } from "@/db/schema/transactions";
import { wallets } from "@/db/schema/wallets";
import { sql, eq, desc } from "drizzle-orm";

export default async function AdminOverviewPage() {
  const [[{ orgCount }], [{ userCount }], [{ txCount }], [{ walletCount }], recentOrgs] = await Promise.all([
    db.select({ orgCount: sql<number>`count(*)::int` }).from(organizations).where(eq(organizations.isActive, true)),
    db.select({ userCount: sql<number>`count(distinct ${organizationMembers.userId})::int` }).from(organizationMembers).where(eq(organizationMembers.isActive, true)),
    db.select({ txCount: sql<number>`count(*)::int` }).from(transactions),
    db.select({ walletCount: sql<number>`count(*)::int` }).from(wallets).where(eq(wallets.isActive, true)),
    db.select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      baseCurrency: organizations.baseCurrency,
      createdAt: organizations.createdAt,
    }).from(organizations).where(eq(organizations.isActive, true)).orderBy(desc(organizations.createdAt)).limit(10),
  ]);

  const cards = [
    { label: "Active Orgs", value: orgCount, color: "var(--red)" },
    { label: "Active Users", value: userCount, color: "var(--amber)" },
    { label: "Total Transactions", value: txCount, color: "var(--accent)" },
    { label: "Active Wallets", value: walletCount, color: "var(--indigo)" },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>System Overview</h1>
        <p className="text-xs font-mono mt-1" style={{ color: "var(--text-3)" }}>All data across all organizations</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: `1px solid ${c.color}22`, borderTop: `2px solid ${c.color}` }}>
            <p className="text-xs font-medium tracking-wide" style={{ color: "var(--text-4)" }}>{c.label.toUpperCase()}</p>
            <p className="mt-2 text-3xl font-semibold font-mono" style={{ color: c.color }}>{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "#0d0505", borderBottom: "1px solid #1a0a0a" }}>
          <h2 className="text-xs font-medium tracking-wide" style={{ color: "var(--red)" }}>RECENT ORGANIZATIONS</h2>
        </div>
        <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
          <thead>
            <tr style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-600">Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-600">Slug</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-600">Currency</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-600">Created</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentOrgs.map((org, i) => (
              <tr key={org.id} style={{ borderBottom: i < recentOrgs.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "var(--text-1)" }}>{org.name}</td>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--text-4)" }}>{org.slug}</td>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--accent)" }}>{org.baseCurrency}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-3)" }}>{new Date(org.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5">
                  <a href={`/admin/orgs/${org.id}`} className="text-xs transition-colors" style={{ color: "var(--red)", opacity: 0.6 }}>
                    Details →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
