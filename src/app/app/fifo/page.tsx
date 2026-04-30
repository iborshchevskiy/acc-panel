import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { runFifo, legsToFifoRows } from "@/lib/fifo/engine";
import RefreshButton from "@/components/refresh-button";
import DisposalBreakdown, { type DisposalEntry } from "./DisposalBreakdown";

/** Display a rate in human-readable form: always show the value ≥ 1 side.
 *  e.g. 1.05 USDT/EUR stays as-is, but 0.043 USDT/CZK flips to 23.3 CZK/USDT. */
function fmtRate(rate: number, base: string, asset: string): string {
  if (rate < 1 && rate > 0) {
    return `${(1 / rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset}/${base}`;
  }
  return `${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${base}/${asset}`;
}

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
          location: transactionLegs.location,
          createdAt: transactionLegs.createdAt,
        })
        .from(transactionLegs)
        .where(inArray(transactionLegs.transactionId, txRows.map((r) => r.id)))
        // Greedy pairing in legsToFifoRows pairs adjacent direction-flips —
        // the order must match the user's original entry sequence for multi-leg
        // exchanges to land on the right per-leg cost basis.
        .orderBy(transactionLegs.createdAt, transactionLegs.id)
    : [];

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  const fifoRows = legsToFifoRows(txRows, legsByTx);

  function txLegsInfo(txId: string | null) {
    if (!txId) return [];
    return (legsByTx.get(txId) ?? []).map((l) => ({
      direction: l.direction,
      amount: l.amount != null ? String(l.amount) : null,
      currency: l.currency,
      location: l.location,
    }));
  }
  const result = runFifo(fifoRows, fiatSet);

  const gainByCurrency = result.summary.reduce<Record<string, number>>((acc, s) => {
    acc[s.gainCurrency] = (acc[s.gainCurrency] ?? 0) + s.totalRealizedGain;
    return acc;
  }, {});
  const gainEntries = Object.entries(gainByCurrency).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">FIFO Cost Basis</h1>
          <p className="text-sm text-slate-500">{result.summary.length} pair{result.summary.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <RefreshButton />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
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
            {/* Mobile cards */}
            <div className="sm:hidden flex flex-col" style={{ backgroundColor: "var(--surface)" }}>
              {result.summary.map((s, i) => {
                const p = result.pairs[s.pair];
                return (
                  <div key={s.pair} className="px-4 py-3 flex flex-col gap-2"
                    style={{ borderBottom: i < result.summary.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-slate-200">{s.pair}</span>
                      <span className="text-sm font-mono font-semibold"
                        style={{ color: s.totalRealizedGain >= 0 ? "var(--accent)" : "var(--red)" }}>
                        {s.totalRealizedGain >= 0 ? "+" : ""}
                        {s.totalRealizedGain.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        <span className="text-[10px] text-slate-600 ml-1">{s.gainCurrency}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
                      <span className="text-slate-600">Holding</span>
                      <span className="text-slate-400 text-right">
                        {s.currentHolding > 1e-9
                          ? <>{s.currentHolding.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-slate-600">{p?.assetCurrency}</span></>
                          : <span className="text-slate-700">—</span>}
                      </span>
                      <span className="text-slate-600">Avg buy</span>
                      <span className="text-slate-400 text-right">
                        {s.avgCost != null && p
                          ? fmtRate(s.avgCost, p.baseCurrency, p.assetCurrency)
                          : <span className="text-slate-700">—</span>}
                      </span>
                      <span className="text-slate-600">Trades</span>
                      <span className="text-slate-500 text-right">{s.tradeCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Holding (fiat)</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Avg Buy Rate</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Realized Gain</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Trades</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.map((s, i) => {
                  const p = result.pairs[s.pair];
                  return (
                  <tr key={s.pair} style={{ backgroundColor: "var(--surface)", borderBottom: i < result.summary.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{s.pair}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                      {s.currentHolding > 1e-9
                        ? <>{s.currentHolding.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-slate-600">{p?.assetCurrency}</span></>
                        : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                      {s.avgCost != null && p
                        ? fmtRate(s.avgCost, p.baseCurrency, p.assetCurrency)
                        : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right">
                      <span style={{ color: s.totalRealizedGain >= 0 ? "var(--accent)" : "var(--red)" }}>
                        {s.totalRealizedGain >= 0 ? "+" : ""}
                        {s.totalRealizedGain.toLocaleString(undefined, { maximumFractionDigits: 4 })} {s.gainCurrency}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 text-right">{s.tradeCount}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Disposals breakdown */}
          {Object.values(result.pairs).some((p) => p.disposals.length > 0) && (
            <DisposalBreakdown
              disposals={Object.values(result.pairs).flatMap((p): DisposalEntry[] =>
                p.disposals.map((d) => ({
                  pair: p.pair,
                  assetCurrency: p.assetCurrency,
                  baseCurrency: p.baseCurrency,
                  txId: d.txId,
                  lotTxId: d.lotTxId,
                  disposedAt: d.disposedAt.toISOString(),
                  lotAcquiredAt: d.lotAcquiredAt ? d.lotAcquiredAt.toISOString() : null,
                  amount: d.amount,
                  proceedsRate: d.proceedsRate,
                  costRate: d.costRate,
                  gain: d.gain,
                  gainCurrency: d.gainCurrency,
                  buyLegs: txLegsInfo(d.lotTxId),
                  sellLegs: txLegsInfo(d.txId),
                }))
              )}
            />
          )}

          {/* Open lots detail */}
          {Object.values(result.pairs).some((p) => p.lots.length > 0) && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
              <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <h2 className="text-sm font-medium text-slate-300">Open lots</h2>
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden flex flex-col" style={{ backgroundColor: "var(--surface)" }}>
                {Object.values(result.pairs).flatMap((p) =>
                  p.lots.filter((l) => l.remainingAmount > 1e-9).map((lot, i) => (
                    <div key={`m-${p.pair}-${i}`} className="px-4 py-3 flex flex-col gap-1.5"
                      style={{ borderBottom: "1px solid var(--inner-border)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-300">{p.pair}</span>
                        <span className="text-[11px] font-mono text-slate-500">{lot.acquiredAt.toISOString().slice(0, 10)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
                        <span className="text-slate-600">Remaining</span>
                        <span className="text-slate-300 text-right">
                          {lot.remainingAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                          <span className="text-slate-600">{p.assetCurrency}</span>
                        </span>
                        <span className="text-slate-600">Cost</span>
                        <span className="text-slate-400 text-right">{fmtRate(lot.costRate, p.baseCurrency, p.assetCurrency)}</span>
                        <span className="text-slate-600">Basis</span>
                        <span className="text-slate-400 text-right">
                          {(lot.remainingAmount * lot.costRate).toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                          <span className="text-slate-600">{p.baseCurrency}</span>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 640 }}>
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
                            {lot.remainingAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-slate-600">{p.assetCurrency}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                            {fmtRate(lot.costRate, p.baseCurrency, p.assetCurrency)}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                            {(lot.remainingAmount * lot.costRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-slate-600">{p.baseCurrency}</span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
