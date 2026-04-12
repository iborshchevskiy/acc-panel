import { db } from "@/db/client";
import { organizationMembers, organizations } from "@/db/schema/system";
import { eq, desc } from "drizzle-orm";

export default async function AdminUsersPage() {
  const users = await db
    .select({
      userId: organizationMembers.userId,
      email: organizationMembers.email,
      role: organizationMembers.role,
      orgName: organizations.name,
      orgId: organizationMembers.organizationId,
      acceptedAt: organizationMembers.acceptedAt,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.isActive, true))
    .orderBy(desc(organizationMembers.createdAt));

  const ROLE_COLOR: Record<string, string> = { org_admin: "var(--accent)", accountant: "var(--blue)", viewer: "var(--text-5)" };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>Users</h1>
        <p className="text-sm" style={{ color: "var(--text-3)" }}>{users.length} active memberships</p>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
        <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
          <thead>
            <tr style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Email / User ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Organization</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={`${u.userId}-${u.orgId}`} style={{ borderBottom: i < users.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                <td className="px-4 py-3">
                  <p className="text-xs" style={{ color: "var(--text-1)" }}>{u.email ?? "—"}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "var(--inner-border)" }}>{u.userId}</p>
                </td>
                <td className="px-4 py-3">
                  <a href={`/admin/orgs/${u.orgId}`} className="text-xs transition-colors" style={{ color: "var(--indigo)" }}>
                    {u.orgName}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ color: ROLE_COLOR[u.role] ?? "var(--text-5)", backgroundColor: (ROLE_COLOR[u.role] ?? "var(--text-5)") + "22" }}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                  {new Date(u.acceptedAt ?? u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
