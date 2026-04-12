import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { cashOperations } from "@/db/schema/capital";
import { organizationMembers } from "@/db/schema/system";
import { eq, desc } from "drizzle-orm";
import { addCashOperation, deleteCashOperation } from "./actions";

export default async function CapitalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const rows = await db.select().from(cashOperations)
    .where(eq(cashOperations.organizationId, membership.organizationId))
    .orderBy(desc(cashOperations.date));

  // Summary per investor per currency
  const summary = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!summary.has(r.investor)) summary.set(r.investor, new Map());
    const inv = summary.get(r.investor)!;
    const amt = parseFloat(r.amount as string);
    inv.set(r.currency, (inv.get(r.currency) ?? 0) + (r.type === "deposit" ? amt : -amt));
  }

  const investors = [...summary.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Capital</h1>
        <p className="text-sm text-slate-500">Investor deposits & withdrawals</p>
      </div>

      {/* Summary cards */}
      {investors.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {investors.map(([investor, balances]) => (
            <div key={investor} className="rounded-xl p-4" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
              <p className="text-xs text-slate-500 truncate">{investor}</p>
              {[...balances.entries()].map(([cur, net]) => (
                <p key={cur} className="mt-1 text-lg font-semibold font-mono"
                  style={{ color: net >= 0 ? "#10b981" : "#ef4444" }}>
                  {net >= 0 ? "+" : ""}{net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-slate-500">{cur}</span>
                </p>
              ))}
              {balances.size === 0 && <p className="mt-1 text-sm text-slate-700">—</p>}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <form action={addCashOperation} className="flex flex-wrap gap-3 rounded-xl p-4"
        style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
        <input type="date" name="date" defaultValue={today} required
          className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500" style={{ colorScheme: "dark" }} />
        <input name="investor" required placeholder="Investor name"
          className="h-9 w-40 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <input name="amount" type="number" step="any" required placeholder="Amount"
          className="h-9 w-32 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <input name="currency" defaultValue="USDT" placeholder="Currency"
          className="h-9 w-24 rounded-md bg-white/5 px-3 text-sm text-slate-200 uppercase outline-none focus:ring-1 focus:ring-emerald-500" />
        <select name="type" className="h-9 rounded-md px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
          style={{ backgroundColor: "#1e2432" }}>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
        </select>
        <input name="comment" placeholder="Comment (optional)"
          className="h-9 flex-1 min-w-40 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <button type="submit" className="h-9 rounded-md px-4 text-sm font-medium"
          style={{ backgroundColor: "#10b981", color: "#0d1117" }}>Add</button>
      </form>

      {/* Ledger */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <span className="text-slate-500 text-sm">No capital entries yet</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #1e2432" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Investor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Comment</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ backgroundColor: "#0d1117", borderBottom: i < rows.length - 1 ? "1px solid #1e2432" : "none" }}>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-200">{r.investor}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                      style={r.type === "deposit"
                        ? { backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981" }
                        : { backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
                      {r.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm font-mono text-right"
                    style={{ color: r.type === "deposit" ? "#10b981" : "#ef4444" }}>
                    {r.type === "deposit" ? "+" : "-"}{parseFloat(r.amount as string).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.currency}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.comment || <span className="text-slate-700">—</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteCashOperation.bind(null, r.id)}>
                      <button type="submit" className="text-xs text-slate-700 hover:text-red-400 transition-colors">×</button>
                    </form>
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
