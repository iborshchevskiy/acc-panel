import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, sql } from "drizzle-orm";

interface PageProps {
  searchParams: Promise<{ bucket?: string }>;
}

// ── SQL-level aggregation helpers ─────────────────────────────────────────────

interface PeriodAgg {
  period: string;
  transaction_type: string;
  direction: string;
  currency: string;
  total: string;
  trade_count: string;
}

interface SpreadAgg {
  pair: string;
  side: string; // 'BUY' | 'SELL'
  avg_rate: string;
  trade_count: string;
  volume: string;
}

function buildPeriodLabel(period: string, bucket: string): string {
  if (bucket === "week") return `W ${period}`;
  return period;
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

  // ── Summary counts (cheap COUNT queries) ─────────────────────────────────
  const [[{ totalTxs }], [{ exchangeTxs }]] = await Promise.all([
    db.select({ totalTxs: sql<number>`count(*)::int` }).from(transactions)
      .where(eq(transactions.organizationId, orgId)),
    db.select({ exchangeTxs: sql<number>`count(*)::int` }).from(transactions)
      .where(and(eq(transactions.organizationId, orgId), eq(transactions.transactionType, "Exchange"))),
  ]);

  // ── Fiat set for this org ────────────────────────────────────────────────
  const fiatRows = await db.select({ code: currencies.code }).from(currencies)
    .where(and(eq(currencies.organizationId, orgId), eq(currencies.type, "fiat")));
  const fiatList = fiatRows.map((r) => r.code);
  const fiatSet = new Set(fiatList);

  // ── Period P&L — aggregated in SQL, returns O(periods × currencies) rows ─
  const dateTruncExpr = bucket === "month"
    ? sql`TO_CHAR(DATE_TRUNC('month', ${transactions.timestamp}), 'YYYY-MM')`
    : bucket === "week"
    ? sql`TO_CHAR(DATE_TRUNC('week', ${transactions.timestamp}), 'YYYY-MM-DD')`
    : sql`TO_CHAR(DATE_TRUNC('day', ${transactions.timestamp}), 'YYYY-MM-DD')`;

  const periodAggs = await db.execute(sql`
    SELECT
      ${dateTruncExpr} AS period,
      t.transaction_type,
      tl.direction,
      tl.currency,
      SUM(tl.amount::numeric)::text AS total,
      COUNT(DISTINCT t.id)::text AS trade_count
    FROM ${transactions} t
    JOIN ${transactionLegs} tl ON tl.transaction_id = t.id
    WHERE t.organization_id = ${orgId}
      AND t.transaction_type IN ('Exchange', 'Revenue')
      AND tl.direction IN ('in', 'out')
      AND tl.currency IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY 1
  `) as unknown as PeriodAgg[];

  // ── Build period buckets from aggregated rows ────────────────────────────
  const periodMap = new Map<string, {
    period: string; label: string;
    exchangePnl: Record<string, number>;
    revenue: Record<string, number>;
    volume: Record<string, number>;
    tradeCount: number;
  }>();

  for (const row of periodAggs) {
    if (!periodMap.has(row.period)) {
      periodMap.set(row.period, {
        period: row.period,
        label: buildPeriodLabel(row.period, bucket),
        exchangePnl: {}, revenue: {}, volume: {}, tradeCount: 0,
      });
    }
    const b = periodMap.get(row.period)!;
    const amt = parseFloat(row.total) || 0;
    const cur = row.currency;

    if (row.transaction_type === "Exchange") {
      // +income, -outcome
      const sign = row.direction === "in" ? 1 : -1;
      b.exchangePnl[cur] = (b.exchangePnl[cur] ?? 0) + sign * amt;
      b.volume[cur] = (b.volume[cur] ?? 0) + amt;
      if (row.direction === "in") b.tradeCount = Math.max(b.tradeCount, parseInt(row.trade_count) || 0);
    } else if (row.transaction_type === "Revenue" && row.direction === "in") {
      b.revenue[cur] = (b.revenue[cur] ?? 0) + amt;
    }
  }

  const periods = [...periodMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // ── Top currencies by volume ────────────────────────────────────────────
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
  const topCurrencies = [...totalVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  // ── Spread analysis — SQL aggregated per pair/side ───────────────────────
  // We use the org's fiat currencies to identify buy vs sell side

  let spreadAggs: SpreadAgg[] = [];
  if (fiatList.length > 0) {
    const fiatArray = sql`ARRAY[${sql.raw(fiatList.map((f) => `'${f.replace(/'/g, "''")}'`).join(","))}]::text[]`;

    spreadAggs = await db.execute(sql`
      SELECT
        CASE
          WHEN tl_in.currency = ANY(${fiatArray}) THEN tl_out.currency || '/' || tl_in.currency
          ELSE tl_in.currency || '/' || tl_out.currency
        END AS pair,
        CASE
          WHEN tl_in.currency = ANY(${fiatArray}) THEN 'SELL'
          ELSE 'BUY'
        END AS side,
        AVG(
          CASE
            WHEN tl_in.currency = ANY(${fiatArray})
              THEN tl_in.amount::numeric / NULLIF(tl_out.amount::numeric, 0)
            ELSE tl_out.amount::numeric / NULLIF(tl_in.amount::numeric, 0)
          END
        )::text AS avg_rate,
        COUNT(*)::text AS trade_count,
        SUM(
          CASE
            WHEN tl_in.currency = ANY(${fiatArray})
              THEN tl_out.amount::numeric
            ELSE tl_in.amount::numeric
          END
        )::text AS volume
      FROM ${transactions} t
      JOIN ${transactionLegs} tl_in  ON tl_in.transaction_id  = t.id AND tl_in.direction  = 'in'
      JOIN ${transactionLegs} tl_out ON tl_out.transaction_id = t.id AND tl_out.direction = 'out'
      WHERE t.organization_id = ${orgId}
        AND t.transaction_type = 'Exchange'
        AND (
          (tl_in.currency = ANY(${fiatArray}) AND tl_out.currency != ANY(${fiatArray}))
          OR
          (tl_out.currency = ANY(${fiatArray}) AND tl_in.currency != ANY(${fiatArray}))
        )
      GROUP BY pair, side
      ORDER BY SUM(
        CASE WHEN tl_in.currency = ANY(${fiatArray}) THEN tl_out.amount::numeric ELSE tl_in.amount::numeric END
      ) DESC
      LIMIT 20
    `) as unknown as SpreadAgg[];
  }

  // Remove unused fiatSet after SQL migration (kept for reference)
  void fiatSet;

  // Coalesce buy+sell rows per pair
  const spreadMap = new Map<string, {
    pair: string; baseCurrency: string; quoteCurrency: string;
    buyCount: number; sellCount: number;
    avgBuy: number | null; avgSell: number | null;
    spread: number | null; marginPct: number | null;
  }>();
  for (const row of spreadAggs) {
    const [base, quote] = row.pair.split("/");
    if (!spreadMap.has(row.pair)) {
      spreadMap.set(row.pair, { pair: row.pair, baseCurrency: base, quoteCurrency: quote, buyCount: 0, sellCount: 0, avgBuy: null, avgSell: null, spread: null, marginPct: null });
    }
    const s = spreadMap.get(row.pair)!;
    const rate = parseFloat(row.avg_rate) || 0;
    const count = parseInt(row.trade_count) || 0;
    if (row.side === "BUY") { s.avgBuy = rate; s.buyCount = count; }
    else { s.avgSell = rate; s.sellCount = count; }
  }
  for (const s of spreadMap.values()) {
    if (s.avgBuy != null && s.avgSell != null) {
      s.spread = s.avgSell - s.avgBuy;
      s.marginPct = s.avgBuy > 0 ? (s.spread / s.avgBuy) * 100 : null;
    }
  }
  const spreads = [...spreadMap.values()];

  // ── Fees (already aggregated) ────────────────────────────────────────────
  const feeRows = await db
    .select({
      currency: transactionLegs.currency,
      total: sql<string>`SUM(${transactionLegs.amount}::numeric)`,
    })
    .from(transactionLegs)
    .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
    .where(and(eq(transactions.organizationId, orgId), eq(transactionLegs.direction, "fee")))
    .groupBy(transactionLegs.currency);


  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-500">{totalTxs.toLocaleString()} transactions</p>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--raised-hi)" }}>
          {(["day", "week", "month"] as const).map((b) => (
            <a key={b} href={`?bucket=${b}`}
              className="h-7 px-3 flex items-center rounded text-xs font-medium transition-colors capitalize"
              style={bucket === b
                ? { backgroundColor: "var(--accent)", color: "var(--surface)" }
                : { color: "var(--text-2)" }}>
              {b}
            </a>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Txs", value: totalTxs.toLocaleString(), sub: "all time" },
          { label: "Exchange Txs", value: exchangeTxs.toLocaleString(), sub: "matched trades" },
          { label: "Top Volume", value: topCurrencies[0] ?? "—", sub: totalVolume.get(topCurrencies[0] ?? "") ? `${(totalVolume.get(topCurrencies[0]!) ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${topCurrencies[0]}` : "no data" },
          { label: "Net Fees", value: feeRows[0]?.currency ?? "—", sub: feeRows[0] ? `${parseFloat(feeRows[0].total ?? "0").toFixed(4)} ${feeRows[0].currency}` : "no fees" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl p-4" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
            <p className="text-xs text-slate-500">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-100">{card.value}</p>
            <p className="text-xs text-slate-600">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Period P&L table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
        <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
          <h2 className="text-sm font-medium text-slate-300">P&L by {bucket}</h2>
        </div>
        {periods.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">No Exchange transactions found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
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
                <tr key={p.period} style={{ backgroundColor: "var(--surface)", borderBottom: i < arr.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{p.label}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{p.tradeCount}</td>
                  {topCurrencies.map((c) => {
                    const v = p.exchangePnl[c] ?? 0;
                    return (
                      <td key={c} className="px-4 py-2.5 text-xs font-mono text-right">
                        {v !== 0 ? (
                          <span style={{ color: v > 0 ? "var(--accent)" : "var(--red)" }}>
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
            <tfoot>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderTop: "1px solid var(--inner-border)" }}>
                <td className="px-4 py-2.5 text-xs font-medium text-slate-400">Total</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{periods.reduce((s, p) => s + p.tradeCount, 0)}</td>
                {topCurrencies.map((c) => {
                  const v = totalExchangePnl.get(c) ?? 0;
                  return (
                    <td key={c} className="px-4 py-2.5 text-xs font-mono font-medium text-right">
                      <span style={{ color: v > 0 ? "var(--accent)" : v < 0 ? "var(--red)" : "var(--text-2)" }}>
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
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
          <div className="px-4 py-3" style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
            <h2 className="text-sm font-medium text-slate-300">Spread / Margin by pair</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
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
                <tr key={s.pair} style={{ backgroundColor: "var(--surface)", borderBottom: i < spreads.length - 1 ? "1px solid var(--inner-border)" : "none" }}>
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
                      <span style={{ color: s.spread >= 0 ? "var(--accent)" : "var(--red)" }}>
                        {s.spread.toLocaleString(undefined, { maximumFractionDigits: 4 })} {s.quoteCurrency}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-right">
                    {s.marginPct != null ? (
                      <span style={{ color: s.marginPct >= 0 ? "var(--accent)" : "var(--red)" }}>
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
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
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
