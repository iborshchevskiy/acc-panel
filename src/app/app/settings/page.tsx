import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizations, organizationMembers } from "@/db/schema/system";
import { currencies } from "@/db/schema/wallets";
import { eq, asc } from "drizzle-orm";
import { updateOrgSettings } from "./actions";

const TIMEZONES = [
  "UTC", "Europe/London", "Europe/Prague", "Europe/Warsaw",
  "Europe/Kiev", "Europe/Moscow", "Asia/Dubai", "Asia/Bangkok",
  "America/New_York", "America/Los_Angeles",
];

const TX_TYPES = [
  "Exchange", "Revenue", "Expense", "Debt", "Transfer", "Fee",
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const [org] = await db.select().from(organizations)
    .where(eq(organizations.id, membership.organizationId)).limit(1);

  const currencyRows = await db.select().from(currencies).orderBy(asc(currencies.type), asc(currencies.code));

  const isAdmin = membership.role === "org_admin";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500">Organisation configuration</p>
      </div>

      {/* Org settings */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
        <h2 className="text-sm font-medium text-slate-300 mb-4">Organisation</h2>
        <form action={updateOrgSettings} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-500">Organisation name</label>
              <input name="name" defaultValue={org.name} required disabled={!isAdmin}
                className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-500">Base currency</label>
              <input name="base_currency" defaultValue={org.baseCurrency} required disabled={!isAdmin}
                className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 uppercase outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-500">Timezone</label>
              <select name="timezone" defaultValue={org.timezone} disabled={!isAdmin}
                className="h-9 rounded-md px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40"
                style={{ backgroundColor: "#1e2432" }}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-500">Org slug</label>
              <input value={org.slug} readOnly
                className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-600 font-mono outline-none cursor-not-allowed" />
            </div>
          </div>
          {isAdmin && (
            <div className="flex justify-end">
              <button type="submit" className="h-8 rounded-md px-4 text-sm font-medium"
                style={{ backgroundColor: "#10b981", color: "#0d1117" }}>Save</button>
            </div>
          )}
        </form>
      </div>

      {/* Transaction types reference */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
        <h2 className="text-sm font-medium text-slate-300 mb-4">Transaction types</h2>
        <div className="flex flex-wrap gap-2">
          {TX_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center rounded px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: "#1e2432", color: "#94a3b8" }}>{t}</span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          These types are used when tagging transactions. They drive filtering, debt tracking, FIFO analysis, and P&L bucketing.
        </p>
      </div>

      {/* Currencies */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
        <h2 className="text-sm font-medium text-slate-300 mb-4">Currencies <span className="text-slate-600 font-normal">({currencyRows.length})</span></h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-2">Crypto</p>
            <div className="flex flex-wrap gap-1.5">
              {currencyRows.filter((c) => c.type === "crypto").map((c) => (
                <span key={c.code} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono"
                  style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                  {c.code}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-2">Fiat</p>
            <div className="flex flex-wrap gap-1.5">
              {currencyRows.filter((c) => c.type === "fiat").map((c) => (
                <span key={c.code} className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono"
                  style={{ backgroundColor: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                  {c.code}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
        <h2 className="text-sm font-medium text-slate-300 mb-4">Account</h2>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Email</span>
            <span className="text-slate-300">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Role</span>
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs"
              style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#10b981" }}>
              {membership.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Org ID</span>
            <span className="text-slate-600 font-mono text-xs">{membership.organizationId}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
