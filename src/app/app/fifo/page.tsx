import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { runFifo, type FifoTxRow } from "@/lib/fifo/engine";
import RefreshButton from "@/components/refresh-button";


export default async function FifoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");

  const fiatRows = await db.select({ code: currencies.code }).from(currencies)
    .where(and(eq(currencies.organizationId, membership.organizationId), eq(currencies.type, "fiat")));
  const fiatSet = new Set(fiatRows.map((r) => r.code));

  // Filter to Exchange-only at DB level — FIFO only processes this type
  // This dramatically reduces memory usage for orgs with large transaction sets
  const txRows = await db
    .select({
      id: transactions.id,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
    })
    .from(transactions)
    .where(and(eq(transactions.organizationId, membership.organizationId), eq(transactions.transactionType, "Exchange"), isNull(transactions.deletedAt)))
    .orderBy(transactions.timestamp);

  const legs = txRows.length > 0
    ? await db
        .select({
          transactionId: transactionLegs.transactionId,
          direction: transactionLegs.direction,
          amount: transactionLegs.amount,
          currency: transactionLegs.currency,
        })
        .from(transactionLegs)
        .where(inArray(transactionLegs.transactionId, txRows.map((r) => r.id)))
    : [];

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

  const gainByCurrency = result.summary.reduce<Record<string, number>>((acc, s) => {
    acc[s.gainCurrency] = (acc[s.gainCurrency] ?? 0) + s.totalRealizedGain;
    return acc;
  }, {});
  const gainEntries = Object.entries(gainByCurrency).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">FIFO Cost Basis</h1>
          <p className="text-sm text-slate-500">{result.summary.length} pair{result.summary.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <RefreshButton />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <p className="text-xs text-slate-500">Realized Gain</p>
          {gainEntries.length === 0 ? (
            <p className="mt-1 text-xl font-semibold font-mono text-slate-600">—</p>
          ) : (
            <div className="mt-1 flex flex-col gap-0.5">
              {gainEntries.map(([currency, gain]) => (
                <p key={currency} className="text-lg font-semibold font-mono leading-tight"
                  style={{ color: gain >= 0 ? "var(--accent)" : "var(--red)" }}>
                  {gain >= 0 ? "+" : ""}{gain.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  <span className="text-xs text-slate-500 ml-1">{currency}</span>
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-600 mt-1">by currency</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <p className="text-xs text-slate-500">Open Positions</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">
            {result.summary.filter((s) => s.currentHolding > 1e-9).length}
          </p>
          <p className="text-xs text-slate-600">pairs with remaining lots</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <p className="text-xs text-slate-500">Pairs Analyzed</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{result.summary.length}</p>
          <p className="text-xs text-slate-600">crypto/fiat pairs</p>
        </div>
      </div>

      {/* Summary table */}
      {result.summary.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
          <span className="text-slate-500 text-sm">No Exchange transactions with crypto/fiat pairs found</span>
          <span className="text-slate-600 text-xs">FIFO requires buy/sell transactions tagged as Exchange type</span>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
            <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
              <h2 className="text-sm font-medium text-slate-300">Summary by pair</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Holding</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Avg Cost</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Realized Gain</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Trades</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.map((s, i) => (
                  <tr key={s.pair} style={{ backgroundColor: "var(--surface)", borderBottom: i < result.summary.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
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
                      <span style={{ color: s.totalRealizedGain >= 0 ? "var(--accent)" : "var(--red)" }}>
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

          {/* Disposals breakdown */}
          {Object.values(result.pairs).some((p) => p.disposals.length > 0) && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
              <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <h2 className="text-sm font-medium text-slate-300">Disposal breakdown</h2>
                <p className="text-xs text-slate-600 mt-0.5">How each realized gain was calculated: gain = (sell rate − cost rate) × amount</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Cost rate</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Sell rate</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Lot acquired</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(result.pairs).flatMap((p) =>
                    p.disposals.map((d, i) => {
                      const isLast = i === p.disposals.length - 1 && p === Object.values(result.pairs).at(-1);
                      return (
                        <tr key={`${p.pair}-d-${i}`} style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
                          <td className="px-4 py-2 text-xs font-mono text-slate-500">
                            {d.disposedAt.toISOString().slice(0, 10)}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono text-slate-400">{p.pair}</td>
                          <td className="px-4 py-2 text-xs font-mono text-right text-slate-300">
                            {d.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {p.cryptoCurrency}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono text-right text-slate-500">
                            {d.costRate === 0
                              ? <span className="text-slate-700">0 (no lot)</span>
                              : <>{d.costRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {p.fiatCurrency}</>}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono text-right text-slate-400">
                            {d.proceedsRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {p.fiatCurrency}
                          </td>
                          <td className="px-4 py-2 text-xs text-right text-slate-600">
                            {d.lotAcquiredAt ? d.lotAcquiredAt.toISOString().slice(0, 10) : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono text-right font-medium">
                            <span style={{ color: d.gain >= 0 ? "var(--accent)" : "var(--red)" }}>
                              {d.gain >= 0 ? "+" : ""}{d.gain.toLocaleString(undefined, { maximumFractionDigits: 4 })} {p.fiatCurrency}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Open lots detail */}
          {Object.values(result.pairs).some((p) => p.lots.length > 0) && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
              <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <h2 className="text-sm font-medium text-slate-300">Open lots</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
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
                        <tr key={`${p.pair}-${i}`} style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
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
