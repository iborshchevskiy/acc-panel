import { db } from "@/db/client";
import { organizations } from "@/db/schema/system";
import { sql, desc } from "drizzle-orm";

export default async function AdminOrgsPage() {
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      baseCurrency: organizations.baseCurrency,
      timezone: organizations.timezone,
      isActive: organizations.isActive,
      createdAt: organizations.createdAt,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM organization_members om
        WHERE om.organization_id = ${organizations.id} AND om.is_active = true
      )`,
      txCount: sql<number>`(
        SELECT count(*)::int FROM transactions t
        WHERE t.organization_id = ${organizations.id}
      )`,
      walletCount: sql<number>`(
        SELECT count(*)::int FROM wallets w
        WHERE w.organization_id = ${organizations.id} AND w.is_active = true
      )`,
    })
    .from(organizations)
    .orderBy(desc(organizations.createdAt));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>Organizations</h1>
        <p className="text-sm" style={{ color: "var(--text-3)" }}>{orgs.length} total</p>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
        <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
          <thead>
            <tr style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Org</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Slug</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Members</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Txs</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-600">Wallets</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Currency</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org, i) => (
              <tr key={org.id} style={{ borderBottom: i < orgs.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                <td className="px-4 py-3">
                  <a href={`/admin/orgs/${org.id}`} className="font-medium transition-colors" style={{ color: "var(--text-1)" }}>
                    {org.name}
                  </a>
                  <div className="text-xs font-mono mt-0.5" style={{ color: "var(--inner-border)" }}>{org.id.slice(0, 8)}…</div>
                </td>
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--text-4)" }}>{org.slug}</td>
                <td className="px-4 py-3 text-xs text-right" style={{ color: "var(--text-5)" }}>{org.memberCount}</td>
                <td className="px-4 py-3 text-xs font-mono text-right" style={{ color: "var(--accent)" }}>{org.txCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-right" style={{ color: "var(--text-5)" }}>{org.walletCount}</td>
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--amber)" }}>{org.baseCurrency}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs"
                    style={{ color: org.isActive ? "var(--accent)" : "var(--red)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: org.isActive ? "var(--accent)" : "var(--red)" }} />
                    {org.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                  {new Date(org.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
