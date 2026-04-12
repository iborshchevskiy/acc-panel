import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { transactionClients, clients } from "@/db/schema/clients";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, sql } from "drizzle-orm";
import { buildPeriodBuckets, buildSpreadAnalysis, type AnalyticsTxRow } from "@/lib/fifo/engine";

interface PageProps {
  searchParams: Promise<{ bucket?: string }>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bucket = (params.bucket ?? "month") as "day" | "week" | "month";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  const fiatRows = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.type, "fiat"));
  const fiatSet = new Set(fiatRows.map((r) => r.code));

  // Fetch all transactions with their legs and client assignments
  const txRows = await db
    .select({
      id: transactions.id,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
      type: transactions.type,
      location: transactions.location,
      clientId: transactionClients.clientId,
      clientName: clients.name,
    })
    .from(transactions)
    .leftJoin(transactionClients, eq(transactionClients.transactionId, transactions.id))
    .leftJoin(clients, eq(clients.id, transactionClients.clientId))
    .where(eq(transactions.organizationId, orgId))
    .orderBy(transactions.timestamp);

  // Fetch legs for all transactions
  const allLegs = await db
    .select({
      transactionId: transactionLegs.transactionId,
      direction: transactionLegs.direction,
      amount: transactionLegs.amount,
      currency: transactionLegs.currency,
    })
    .from(transactionLegs)
    .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
    .where(eq(transactions.organizationId, orgId));

  const legsByTx = new Map<string, typeof allLegs>();
  for (const leg of allLegs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  // Build analytics rows
  const analyticsRows: AnalyticsTxRow[] = txRows.map((tx) => {
    const legs = legsByTx.get(tx.id) ?? [];
    const inLeg = legs.find((l) => l.direction === "in");
    const outLeg = legs.find((l) => l.direction === "out");
    return {
      id: tx.id,
      timestamp: new Date(tx.timestamp),
      transactionType: tx.transactionType,
      type: tx.type,
      location: tx.location,
      incomeAmount: inLeg?.amount ?? null,
      incomeCurrency: inLeg?.currency ?? null,
      outcomeAmount: outLeg?.amount ?? null,
      outcomeCurrency: outLeg?.currency ?? null,
      clientId: tx.clientId ?? null,
      clientName: tx.clientName ?? null,
    };
  });

  const periods = buildPeriodBuckets(analyticsRows, bucket);
  const spreads = buildSpreadAnalysis(analyticsRows, fiatSet);

  // Summary totals
  const totalVolume = new Map<string, number>();
  const totalExchangePnl = new Map<string, number>();
  for (const p of periods) {
    for (const [cur, amt] of Object.entries(p.volume)) {
      totalVolume.set(cur, (totalVolume.get(cur) ?? 0) + amt);
    }
    for (const [cur, amt] of Object.entries(p.exchangePnl)) {
      totalExchangePnl.set(cur, (totalExchangePnl.get(cur) ?? 0) + amt);
    }
  }

  // Fees
  const feeRows = await db
    .select({
      currency: transactionLegs.currency,
      total: sql<string>`SUM(${transactionLegs.amount}::numeric)`,
    })
    .from(transactionLegs)
    .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
    .where(and(eq(transactions.organizationId, orgId), eq(transactionLegs.direction, "fee")))
    .groupBy(transactionLegs.currency);

  const topCurrencies = [...totalVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-500">{analyticsRows.length.toLocaleString()} transactions</p>
        </div>
        {/* Bucket selector */}
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "#161b27" }}>
          {(["day", "week", "month"] as const).map((b) => (
            <a key={b} href={`?bucket=${b}`}
              className="h-7 px-3 flex items-center rounded text-xs font-medium transition-colors capitalize"
              style={bucket === b
                ? { backgroundColor: "#10b981", color: "#0d1117" }
                : { color: "#64748b" }}>
              {b}
            </a>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Txs", value: analyticsRows.length.toLocaleString(), sub: "all time" },
          { label: "Exchange Txs", value: analyticsRows.filter((r) => r.transactionType === "Exchange").length.toLocaleString(), sub: "matched trades" },
          { label: "Top Volume", value: topCurrencies[0] ?? "—", sub: totalVolume.get(topCurrencies[0] ?? "") ? `${(totalVolume.get(topCurrencies[0]!) ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${topCurrencies[0]}` : "no data" },
          { label: "Net Fees", value: feeRows[0]?.currency ?? "—", sub: feeRows[0] ? `${parseFloat(feeRows[0].total ?? "0").toFixed(4)} ${feeRows[0].currency}` : "no fees" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl p-4" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
            <p className="text-xs text-slate-500">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{card.value}</p>
            <p className="text-xs text-slate-600">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Period P&L table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1e2432" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
          <h2 className="text-sm font-medium text-slate-300">P&L by {bucket}</h2>
        </div>
        {periods.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">No Exchange transactions found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f1117", borderBottom: "1px solid #1e2432" }}>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Period</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Trades</th>
                {topCurrencies.map((c) => (
                  <th key={c} className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">P&L {c}</th>
                ))}
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Volume</th>
              </tr>
            </thead>
            <tbody>
              {[...periods].reverse().map((p, i, arr) => (
                <tr key={p.period} style={{ backgroundColor: "#0d1117", borderBottom: i < arr.length - 1 ? "1px solid #1e2432" : "none" }}>
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{p.label}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{p.tradeCount}</td>
                  {topCurrencies.map((c) => {
                    const v = p.exchangePnl[c] ?? 0;
                    return (
                      <td key={c} className="px-4 py-2.5 text-xs font-mono text-right">
                        {v !== 0 ? (
                          <span style={{ color: v > 0 ? "#10b981" : "#ef4444" }}>
                            {v > 0 ? "+" : ""}{v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-xs text-slate-500 text-right font-mono">
                    {Object.entries(p.volume)
                      .slice(0, 2)
                      .map(([c, v]) => `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${c}`)
                      .join(" / ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ backgroundColor: "#161b27", borderTop: "1px solid #1e2432" }}>
                <td className="px-4 py-2.5 text-xs font-medium text-slate-400">Total</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{periods.reduce((s, p) => s + p.tradeCount, 0)}</td>
                {topCurrencies.map((c) => {
                  const v = totalExchangePnl.get(c) ?? 0;
                  return (
                    <td key={c} className="px-4 py-2.5 text-xs font-mono font-medium text-right">
                      <span style={{ color: v > 0 ? "#10b981" : v < 0 ? "#ef4444" : "#64748b" }}>
                        {v !== 0 ? `${v > 0 ? "+" : ""}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                      </span>
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Spread analysis */}
      {spreads.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1e2432" }}>
          <div className="px-4 py-3" style={{ backgroundColor: "#161b27", borderBottom: "1px solid #1e2432" }}>
            <h2 className="text-sm font-medium text-slate-300">Spread / Margin by pair</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0f1117", borderBottom: "1px solid #1e2432" }}>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Buys</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Sells</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Avg Buy</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Avg Sell</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Spread</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Margin</th>
              </tr>
            </thead>
            <tbody>
              {spreads.map((s, i) => (
                <tr key={s.pair} style={{ backgroundColor: "#0d1117", borderBottom: i < spreads.length - 1 ? "1px solid #1e2432" : "none" }}>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-300">{s.pair}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 text-right">{s.buyCount}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 text-right">{s.sellCount}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-400 text-right">
                    {s.avgBuy != null ? s.avgBuy.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate-400 text-right">
                    {s.avgSell != null ? s.avgSell.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-right">
                    {s.spread != null ? (
                      <span style={{ color: s.spread >= 0 ? "#10b981" : "#ef4444" }}>
                        {s.spread.toLocaleString(undefined, { maximumFractionDigits: 4 })} {s.quoteCurrency}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-right">
                    {s.marginPct != null ? (
                      <span style={{ color: s.marginPct >= 0 ? "#10b981" : "#ef4444" }}>
                        {s.marginPct.toFixed(2)}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fee summary */}
      {feeRows.length > 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "#161b27", border: "1px solid #1e2432" }}>
          <h2 className="text-sm font-medium text-slate-300 mb-3">Fees paid</h2>
          <div className="flex flex-wrap gap-4">
            {feeRows.map((f) => (
              <div key={f.currency} className="text-sm">
                <span className="text-slate-400 font-mono">
                  {parseFloat(f.total ?? "0").toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </span>
                <span className="ml-1 text-slate-600">{f.currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
