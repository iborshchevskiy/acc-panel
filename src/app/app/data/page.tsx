import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { eq, sql } from "drizzle-orm";
import DataImport from "./data-import";

export default async function DataPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.organizationId, membership.organizationId));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Data Hub</h1>
        <p className="text-sm text-slate-500">{count.toLocaleString()} transactions in database</p>
      </div>

      {/* Export */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
        <h2 className="text-sm font-medium text-slate-300 mb-4">Export</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=csv"
            className="h-9 flex items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
            style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export CSV
          </a>
          <a href="/api/export?format=json"
            className="h-9 flex items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
            style={{ backgroundColor: "var(--indigo-chip-bg)", color: "var(--indigo)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Export JSON
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Exports all transactions in v1-compatible semicolon-delimited CSV format (UTF-8 with BOM) or JSON.
        </p>
      </div>

      {/* Import */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
        <h2 className="text-sm font-medium text-slate-300 mb-4">Import</h2>
        <DataImport />
      </div>
    </div>
  );
}
