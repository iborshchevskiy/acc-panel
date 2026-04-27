import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { cashOperations, investors } from "@/db/schema/capital";
import { organizationMembers } from "@/db/schema/system";
import { eq, desc, asc } from "drizzle-orm";
import { addCashOperation, deleteCashOperation } from "./actions";
import InvestorPicker from "./InvestorPicker";

export default async function CapitalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const [rows, investorRows] = await Promise.all([
    db.select().from(cashOperations)
      .where(eq(cashOperations.organizationId, membership.organizationId))
      .orderBy(desc(cashOperations.date)),
    db.select({ id: investors.id, name: investors.name, note: investors.note })
      .from(investors)
      .where(eq(investors.organizationId, membership.organizationId))
      .orderBy(asc(investors.name)),
  ]);

  // Summary per investor per currency — derived from cash_operations so
  // historical rows (pre-investors-table) still aggregate correctly.
  const summary = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!summary.has(r.investor)) summary.set(r.investor, new Map());
    const inv = summary.get(r.investor)!;
    const amt = parseFloat(r.amount as string);
    inv.set(r.currency, (inv.get(r.currency) ?? 0) + (r.type === "deposit" ? amt : -amt));
  }

  // Merge in known investors with zero balance so they still show a card.
  for (const inv of investorRows) {
    if (!summary.has(inv.name)) summary.set(inv.name, new Map());
  }

  const investorSummary = [...summary.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Capital</h1>
        <p className="text-sm text-slate-500">Investor deposits & withdrawals</p>
      </div>

      {/* Summary cards */}
      {investorSummary.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {investorSummary.map(([investor, balances]) => (
            <div key={investor} className="rounded-xl p-4" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
              <p className="text-xs text-slate-500 truncate">{investor}</p>
              {[...balances.entries()].map(([cur, net]) => (
                <p key={cur} className="mt-1 text-lg font-semibold font-mono"
                  style={{ color: net >= 0 ? "var(--accent)" : "var(--red)" }}>
                  {net >= 0 ? "+" : ""}{net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-slate-500">{cur}</span>
                </p>
              ))}
              {balances.size === 0 && <p className="mt-1 text-sm text-slate-700">no activity yet</p>}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <form action={addCashOperation} className="flex flex-wrap gap-3 rounded-xl p-4"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
        <input type="date" name="date" defaultValue={today} required
          className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500" style={{ colorScheme: "dark" }} />
        <InvestorPicker initial={investorRows} />
        <input name="amount" type="number" step="any" required placeholder="Amount"
          className="h-9 w-32 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <input name="currency" defaultValue="USDT" placeholder="Currency"
          className="h-9 w-24 rounded-md bg-white/5 px-3 text-sm text-slate-200 uppercase outline-none focus:ring-1 focus:ring-emerald-500" />
        <select name="type" className="h-9 rounded-md px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
          style={{ backgroundColor: "var(--inner-border)" }}>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
        </select>
        <input name="comment" placeholder="Comment (optional)"
          className="h-9 flex-1 min-w-40 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500" />
        <button type="submit" className="h-9 rounded-md px-4 text-sm font-medium"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}>Add</button>
      </form>

      {/* Ledger */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <span className="text-slate-500 text-sm">No capital entries yet</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--inner-border)" }}>
         <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
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
                <tr key={r.id} style={{ backgroundColor: "var(--surface)", borderBottom: i < rows.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-200">{r.investor}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                      style={r.type === "deposit"
                        ? { backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }
                        : { backgroundColor: "var(--red-chip-bg)", color: "var(--red)" }}>
                      {r.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sm font-mono text-right"
                    style={{ color: r.type === "deposit" ? "var(--accent)" : "var(--red)" }}>
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
        </div>
      )}
    </div>
  );
}
