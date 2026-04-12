import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq } from "drizzle-orm";
import { runFifo, type FifoTxRow } from "@/lib/fifo/engine";

export default async function FifoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const fiatRows = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.type, "fiat"));
  const fiatSet = new Set(fiatRows.map((r) => r.code));

  const txRows = await db
    .select({
      id: transactions.id,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
    })
    .from(transactions)
    .where(eq(transactions.organizationId, membership.organizationId))
    .orderBy(transactions.timestamp);

  const legs = await db
    .select({
      transactionId: transactionLegs.transactionId,
      direction: transactionLegs.direction,
      amount: transactionLegs.amount,
      currency: transactionLegs.currency,
    })
    .from(transactionLegs)
    .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
    .where(eq(transactions.organizationId, membership.organizationId));

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  const fifoRows: FifoTxRow[] = txRows.map((tx) => {
    const txLegs = legsByTx.get(tx.id) ?? [];
    const inLeg = txLegs.find((l) => l.direction === "in");
    const outLeg = txLegs.find((l) => l.direction === "out");
    return {
      id: tx.id,
      timestamp: new Date(tx.timestamp),
      transactionType: tx.transactionType,
      incomeAmount: inLeg?.amount ?? null,
      incomeCurrency: inLeg?.currency ?? null,
      outcomeAmount: outLeg?.amount ?? null,
      outcomeCurrency: outLeg?.currency ?? null,
    };
  });

  const result = runFifo(fifoRows, fiatSet);

  const totalRealizedGain = result.summary.reduce((s, p) => s + p.totalRealizedGain, 0);
  const gainCurrencies = [...new Set(result.summary.map((s) => s.gainCurrency))];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">FIFO Cost Basis</h1>
        <p className="text-sm text-slate-500">{result.summary.length} pair{result.summary.length !== 1 ? "s" : ""} tracked</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <p className="text-xs text-slate-500">Total Realized Gain</p>
          <p className="mt-1 text-xl font-semibold font-mono"
            style={{ color: totalRealizedGain >= 0 ? "#10b981" : "#ef4444" }}>
            {totalRealizedGain >= 0 ? "+" : ""}{totalRealizedGain.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-600">{gainCurrencies.join(", ") || "—"}</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <p className="text-xs text-slate-500">Open Positions</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {result.summary.filter((s) => s.currentHolding > 1e-9).length}
          </p>
          <p className="text-xs text-slate-600">pairs with remaining lots</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <p className="text-xs text-slate-500">Pairs Analyzed</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{result.summary.length}</p>
          <p className="text-xs text-slate-600">crypto/fiat pairs</p>
        </div>
      </div>

      {/* Summary table */}
      {result.summary.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <span className="text-slate-500 text-sm">No Exchange transactions with crypto/fiat pairs found</span>
          <span className="text-slate-600 text-xs">FIFO requires buy/sell transactions tagged as Exchange type</span>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1e2432" }}>
            <div className="px-4 py-3" style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
              <h2 className="text-sm font-medium text-slate-300">Summary by pair</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#0f1117", borderBottom: "1px solid #1e2432" }}>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Holding</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Avg Cost</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Realized Gain</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Trades</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.map((s, i) => (
                  <tr key={s.pair} style={{ backgroundColor: "#0d1117", borderBottom: i < result.summary.length - 1 ? "1px solid #1e2432" : "none" }}>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{s.pair}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                      {s.currentHolding > 1e-9
                        ? s.currentHolding.toLocaleString(undefined, { maximumFractionDigits: 6 })
                        : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                      {s.avgCost != null
                        ? s.avgCost.toLocaleString(undefined, { maximumFractionDigits: 4 })
                        : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right">
                      <span style={{ color: s.totalRealizedGain >= 0 ? "#10b981" : "#ef4444" }}>
                        {s.totalRealizedGain >= 0 ? "+" : ""}
                        {s.totalRealizedGain.toLocaleString(undefined, { maximumFractionDigits: 2 })} {s.gainCurrency}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 text-right">{s.tradeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Open lots detail */}
          {Object.values(result.pairs).some((p) => p.lots.length > 0) && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1e2432" }}>
              <div className="px-4 py-3" style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
                <h2 className="text-sm font-medium text-slate-300">Open lots</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#0f1117", borderBottom: "1px solid #1e2432" }}>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Acquired</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Remaining</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Cost Rate</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Cost Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(result.pairs).flatMap((p) =>
                    p.lots
                      .filter((l) => l.remainingAmount > 1e-9)
                      .map((lot, i) => (
                        <tr key={`${p.pair}-${i}`} style={{ backgroundColor: "#0d1117", borderBottom: "1px solid #1e2432" }}>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{p.pair}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">
                            {lot.acquiredAt.toISOString().slice(0, 10)}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-300">
                            {lot.remainingAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {p.cryptoCurrency}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                            {lot.costRate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {p.fiatCurrency}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                            {(lot.remainingAmount * lot.costRate).toLocaleString(undefined, { maximumFractionDigits: 2 })} {p.fiatCurrency}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
