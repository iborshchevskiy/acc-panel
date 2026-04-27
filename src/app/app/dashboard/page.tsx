import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets } from "@/db/schema/wallets";
import { clients } from "@/db/schema/clients";
import { organizationMembers, organizations } from "@/db/schema/system";
import { eq, and, desc, sql, inArray, isNull, gte } from "drizzle-orm";
import { cashOperations } from "@/db/schema/capital";
import DashboardFilters from "./DashboardFilters";
import NetPositionFilter from "./NetPositionFilter";

export const metadata = { title: "Dashboard — AccPanel" };

const TYPE_COLORS: Record<string, string> = {
  Exchange: "var(--indigo)",
  Revenue:  "var(--accent)",
  Expense:  "var(--red)",
  Debt:     "var(--amber)",
  Transfer: "var(--text-2)",
  Fee:      "var(--violet)",
};

function netFlowQuery(orgId: string, from?: Date, to?: Date) {
  return sql`
    SELECT
      tl.currency,
      SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE -tl.amount::numeric END)::text AS net_flow
    FROM transaction_legs tl
    JOIN transactions t ON t.id = tl.transaction_id
    WHERE t.organization_id = ${orgId}
      AND t.transaction_type = 'Exchange'
      AND t.deleted_at IS NULL
      AND tl.direction IN ('in', 'out')
      AND tl.currency IS NOT NULL
      ${from ? sql`AND t.timestamp >= ${from.toISOString()}` : sql``}
      ${to   ? sql`AND t.timestamp <= ${to.toISOString()}`   : sql``}
    GROUP BY tl.currency
    HAVING ABS(SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE -tl.amount::numeric END)) > 0.001
    ORDER BY ABS(SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE -tl.amount::numeric END)) DESC
    LIMIT 8
  `;
}

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; preset?: string; asOf?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  const [org] = await db.select({ name: organizations.name }).from(organizations)
    .where(eq(organizations.id, orgId)).limit(1);

  const now = new Date();
  const params = await searchParams;
  const preset = params.preset ?? "mtd";
  const asOfParam = params.asOf ?? "";
  const asOfDate = asOfParam ? new Date(asOfParam) : undefined;

  // Resolve date range from params
  const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let rangeFrom: Date | undefined;
  let rangeTo: Date | undefined;

  if (preset === "all") {
    rangeFrom = undefined;
    rangeTo = undefined;
  } else if (params.from && params.to) {
    rangeFrom = new Date(`${params.from}T00:00:00Z`);
    rangeTo   = new Date(`${params.to}T23:59:59Z`);
  } else {
    // default: MTD
    rangeFrom = mtdStart;
    rangeTo   = now;
  }

  const fromStr = params.from ?? mtdStart.toISOString().slice(0, 10);
  const toStr   = params.to   ?? now.toISOString().slice(0, 10);

  // ── All queries in parallel ───────────────────────────────────────────────────
  const [
    [{ txCount }],
    [{ walletCount }],
    [{ clientCount }],
    [{ unmatchedCount }],
    [{ mtdExchangeCount }],
    mtdNetFlowRows,
    allTimeNetFlowRows,
    exchangeVolumeRows,
    recent,
  ] = await Promise.all([
    db.select({ txCount: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(eq(transactions.organizationId, orgId), isNull(transactions.deletedAt))),

    db.select({ walletCount: sql<number>`count(*)::int` })
      .from(wallets).where(eq(wallets.organizationId, orgId)),

    db.select({ clientCount: sql<number>`count(*)::int` })
      .from(clients).where(eq(clients.organizationId, orgId)),

    db.select({ unmatchedCount: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, orgId),
        eq(transactions.isMatched, false),
        isNull(transactions.deletedAt),
      )),

    db.select({ mtdExchangeCount: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, orgId),
        eq(transactions.transactionType, "Exchange"),
        isNull(transactions.deletedAt),
        gte(transactions.timestamp, mtdStart),
      )),

    // Period net flow per currency (Exchange only)
    db.execute(netFlowQuery(orgId, rangeFrom, rangeTo)) as unknown as Promise<Array<{ currency: string; net_flow: string }>>,

    // All-time net flow per currency (Exchange only)
    db.execute(netFlowQuery(orgId)) as unknown as Promise<Array<{ currency: string; net_flow: string }>>,

    // Exchange volume per currency (in + out) — filtered by period
    db.execute(sql`
      SELECT
        tl.currency,
        SUM(CASE WHEN tl.direction = 'in'  THEN tl.amount::numeric ELSE 0 END)::text AS vol_in,
        SUM(CASE WHEN tl.direction = 'out' THEN tl.amount::numeric ELSE 0 END)::text AS vol_out
      FROM transaction_legs tl
      JOIN transactions t ON t.id = tl.transaction_id
      WHERE t.organization_id = ${orgId}
        AND t.transaction_type = 'Exchange'
        AND t.deleted_at IS NULL
        AND tl.currency IS NOT NULL
        AND tl.direction IN ('in', 'out')
        ${rangeFrom ? sql`AND t.timestamp >= ${rangeFrom.toISOString()}` : sql``}
        ${rangeTo   ? sql`AND t.timestamp <= ${rangeTo.toISOString()}`   : sql``}
      GROUP BY tl.currency
      ORDER BY SUM(tl.amount::numeric) DESC
      LIMIT 12
    `) as unknown as Promise<Array<{ currency: string; vol_in: string; vol_out: string }>>,

    // Recent 5 transactions
    db.select({
      id: transactions.id,
      txHash: transactions.txHash,
      timestamp: transactions.timestamp,
      transactionType: transactions.transactionType,
      type: transactions.type,
    })
      .from(transactions)
      .where(and(eq(transactions.organizationId, orgId), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.timestamp))
      .limit(5),
  ]);

  // ── Net positions (depends on nothing above) ─────────────────────────────────
  const recentIds = recent.map((r) => r.id);
  const [netPositionRows, recentLegs] = await Promise.all([
    db.execute(sql`
      SELECT currency, SUM(actual)::text AS actual, SUM(projected)::text AS projected
      FROM (
        SELECT
          tl.currency,
          SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE 0 END) -
          SUM(CASE WHEN tl.direction IN ('out', 'fee') AND t.status IS DISTINCT FROM 'in_process'
                   THEN tl.amount::numeric ELSE 0 END) AS actual,
          SUM(CASE WHEN tl.direction = 'in'            THEN tl.amount::numeric ELSE 0 END) -
          SUM(CASE WHEN tl.direction IN ('out', 'fee') THEN tl.amount::numeric ELSE 0 END) AS projected
        FROM transaction_legs tl
        JOIN transactions t ON t.id = tl.transaction_id
        WHERE t.organization_id = ${orgId}
          AND t.deleted_at IS NULL
          AND tl.currency IS NOT NULL
          AND tl.direction IN ('in', 'out', 'fee')
          ${asOfDate ? sql`AND t.timestamp <= ${asOfDate.toISOString()}` : sql``}
        GROUP BY tl.currency

        UNION ALL

        SELECT
          currency,
          SUM(CASE WHEN type = 'deposit' THEN amount::numeric ELSE -amount::numeric END) AS actual,
          SUM(CASE WHEN type = 'deposit' THEN amount::numeric ELSE -amount::numeric END) AS projected
        FROM ${cashOperations}
        WHERE organization_id = ${orgId}
          ${asOfDate ? sql`AND created_at <= ${asOfDate.toISOString()}` : sql``}
        GROUP BY currency
      ) combined
      GROUP BY currency
      HAVING ABS(SUM(actual)) > 0.0001 OR ABS(SUM(projected)) > 0.0001
      ORDER BY ABS(SUM(projected)) DESC
      LIMIT 8
    `) as unknown as Promise<Array<{ currency: string; actual: string; projected: string }>>,

    recentIds.length > 0
      ? db.select({
          transactionId: transactionLegs.transactionId,
          direction: transactionLegs.direction,
          amount: transactionLegs.amount,
          currency: transactionLegs.currency,
        }).from(transactionLegs).where(inArray(transactionLegs.transactionId, recentIds))
      : Promise.resolve([]),
  ]);

  const legsByTx = new Map<string, typeof recentLegs>();
  for (const l of recentLegs) {
    const arr = legsByTx.get(l.transactionId) ?? [];
    arr.push(l);
    legsByTx.set(l.transactionId, arr);
  }

  // Build all-time lookup for comparison in the card
  const allTimeByCurrency = new Map(allTimeNetFlowRows.map((r) => [r.currency, parseFloat(r.net_flow)]));

  const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    return (v >= 0 ? "+" : "") + v.toLocaleString(undefined, { maximumFractionDigits: abs > 10000 ? 0 : abs > 1 ? 2 : 6 });
  };

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-5 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>
            {org?.name ?? "Dashboard"}
          </h1>
          <p className="mt-0.5 text-xs font-mono" style={{ color: "var(--text-3)" }}>
            {monthName} {now.getUTCFullYear()} · {txCount.toLocaleString()} transactions
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:gap-3 sm:justify-end">
          <DashboardFilters from={fromStr} to={toStr} preset={preset} />
          <Link
            href="/app/analytics"
            className="h-6 px-2.5 flex items-center rounded text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-4)" }}
          >
            Analytics →
          </Link>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">

        {/* Net Exchange P&L */}
        <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--accent)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
            Net P&L — {preset === "all" ? "all-time" : preset === "custom" ? `${fromStr} → ${toStr}` : preset.toUpperCase()}
          </p>
          {mtdNetFlowRows.length === 0 ? (
            <p className="mt-2.5 text-sm" style={{ color: "var(--text-3)" }}>No exchanges this month</p>
          ) : (
            <div className="mt-2 flex flex-col gap-0.5">
              {mtdNetFlowRows.slice(0, 4).map((r) => {
                const mtd = parseFloat(r.net_flow);
                const allTime = allTimeByCurrency.get(r.currency) ?? 0;
                return (
                  <div key={r.currency} className="flex items-baseline justify-between gap-2">
                    <span
                      className="font-[family-name:var(--font-ibm-plex-mono)] text-lg font-medium leading-tight"
                      style={{ color: mtd >= 0 ? "var(--accent)" : "var(--red)" }}
                    >
                      {fmt(mtd)}
                      <span className="ml-1 text-xs font-medium" style={{ color: "var(--text-4)" }}>{r.currency}</span>
                    </span>
                    <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: "var(--text-4)" }}
                      title="All-time">
                      {fmt(allTimeByCurrency.get(r.currency) ?? 0)} all
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            net inventory change · Exchange
          </p>
        </div>

        {/* MTD Exchanges */}
        <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--indigo)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Exchanges MTD</p>
          <p className="mt-2.5 font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium leading-none" style={{ color: "var(--indigo)" }}>
            {mtdExchangeCount.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            {txCount.toLocaleString()} all-time
          </p>
        </div>

        {/* Wallets / Clients */}
        <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--amber)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Wallets / Clients</p>
          <p className="mt-2.5 leading-none">
            <span className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium" style={{ color: "var(--amber)" }}>
              {walletCount}
            </span>
            <span className="mx-2 text-lg" style={{ color: "var(--text-3)", opacity: 0.4 }}>/</span>
            <span className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium" style={{ color: "var(--amber)" }}>
              {clientCount}
            </span>
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>addresses · counterparties</p>
        </div>

        {/* Unmatched transactions */}
        <Link
          href="/app/transactions"
          className="rounded-xl p-3 sm:p-4 transition-all hover:translate-y-[-1px]"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: `2px solid ${unmatchedCount > 0 ? "var(--red)" : "var(--text-3)"}`,
          }}
        >
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Unmatched Txs</p>
          <p className="mt-2.5 font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium leading-none"
            style={{ color: unmatchedCount > 0 ? "var(--red)" : "var(--text-2)" }}>
            {unmatchedCount.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            {unmatchedCount === 0 ? "all matched ✓" : "need attention"}
          </p>
        </Link>
      </div>

      {/* ── Net positions ───────────────────────────────────────────────────── */}
      {netPositionRows.length > 0 && (
        <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:flex-wrap">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
                Net Positions
              </p>
              {asOfParam && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--amber)", backgroundColor: "color-mix(in srgb, var(--amber) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 25%, transparent)" }}>
                  snapshot: {asOfParam.replace("T", " ")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap sm:gap-4">
              <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-3)" }}>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--amber)", opacity: 0.7 }} />
                  actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--accent)", opacity: 0.7 }} />
                  projected
                </span>
              </div>
              <NetPositionFilter asOf={asOfParam} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {netPositionRows.map((pos) => {
              const actual    = parseFloat(pos.actual);
              const projected = parseFloat(pos.projected);
              const hasDiff   = Math.abs(actual - projected) > 0.0001;
              return (
                <div key={pos.currency} className="flex items-center gap-1.5">
                  {hasDiff ? (
                    <>
                      <div className="flex items-baseline gap-1.5 rounded-lg px-3 py-1.5"
                        style={{ backgroundColor: "color-mix(in srgb, var(--amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--amber) 25%, transparent)" }}>
                        <span className="font-[family-name:var(--font-ibm-plex-mono)] text-sm font-medium" style={{ color: "var(--amber)" }}>{fmt(actual)}</span>
                        <span className="text-xs font-medium" style={{ color: "var(--text-4)" }}>{pos.currency}</span>
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--text-3)" }}>→</span>
                      <div className="flex items-baseline gap-1.5 rounded-lg px-3 py-1.5"
                        style={{ backgroundColor: "var(--green-chip-bg)", border: "1px solid var(--green-border-lo)" }}>
                        <span className="font-[family-name:var(--font-ibm-plex-mono)] text-sm font-medium" style={{ color: "var(--accent)" }}>{fmt(projected)}</span>
                        <span className="text-xs font-medium" style={{ color: "var(--text-4)" }}>{pos.currency}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-baseline gap-1.5 rounded-lg px-3 py-1.5"
                      style={{ backgroundColor: projected >= 0 ? "var(--green-chip-bg)" : "var(--red-chip-bg)", border: `1px solid ${projected >= 0 ? "var(--green-border-lo)" : "var(--red-border-lo)"}` }}>
                      <span className="font-[family-name:var(--font-ibm-plex-mono)] text-sm font-medium" style={{ color: projected >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt(projected)}</span>
                      <span className="text-xs font-medium" style={{ color: "var(--text-4)" }}>{pos.currency}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Exchange Volume by currency ─────────────────────────────────────── */}
      {exchangeVolumeRows.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
              Exchange Volume
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-3)" }}>all-time · income + outcome per currency</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ backgroundColor: "var(--bg)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-4 py-2 text-left font-medium" style={{ color: "var(--text-4)" }}>Currency</th>
                  <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--accent)" }}>Volume In</th>
                  <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--red)" }}>Volume Out</th>
                  <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--text-4)" }}>Total</th>
                  <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--text-4)" }}>Net (all-time)</th>
                </tr>
              </thead>
              <tbody>
                {exchangeVolumeRows.map((row, i) => {
                  const volIn  = parseFloat((row as { vol_in: string }).vol_in  ?? "0");
                  const volOut = parseFloat((row as { vol_out: string }).vol_out ?? "0");
                  const total  = volIn + volOut;
                  const net    = allTimeByCurrency.get((row as { currency: string }).currency ?? "") ?? (volIn - volOut);
                  const isLast = i === exchangeVolumeRows.length - 1;
                  return (
                    <tr key={row.currency} style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-medium" style={{ color: "var(--text-1)" }}>{(row as { currency: string }).currency}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--accent)" }}>
                        {volIn > 0 ? fmt(volIn) : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--red)" }}>
                        {volOut > 0 ? fmt(volOut) : <span style={{ color: "var(--text-4)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text-2)" }}>
                        {fmt(total)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono"
                        style={{ color: net >= 0 ? "var(--accent)" : "var(--red)" }}>
                        {fmt(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent activity ─────────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
              Recent Activity
            </p>
            <Link href="/app/transactions" className="text-xs transition-colors" style={{ color: "var(--text-3)" }}>
              View all →
            </Link>
          </div>

          {/* Mobile: card list */}
          <ul className="flex flex-col sm:hidden" style={{ backgroundColor: "var(--bg)" }}>
            {recent.map((tx, i) => {
              const legs = legsByTx.get(tx.id) ?? [];
              const inLeg  = legs.find((l) => l.direction === "in");
              const outLeg = legs.find((l) => l.direction === "out");
              const typeColor = tx.transactionType
                ? (TYPE_COLORS[tx.transactionType] ?? "var(--text-2)")
                : "var(--text-2)";
              return (
                <li key={tx.id}
                  style={{ borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <Link href="/app/transactions" className="flex flex-col gap-1.5 px-3 py-3 active:opacity-70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
                        {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                      </span>
                      {tx.transactionType && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium shrink-0"
                          style={{ backgroundColor: typeColor + "22", color: typeColor }}>
                          {tx.transactionType}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono leading-snug">
                      {inLeg && (
                        <div style={{ color: "var(--accent)" }}>
                          +{Number(inLeg.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {inLeg.currency}
                        </div>
                      )}
                      {outLeg && (
                        <div style={{ color: "var(--red)" }}>
                          -{Number(outLeg.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {outLeg.currency}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop / tablet: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
              <tbody>
                {recent.map((tx, i) => {
                  const legs = legsByTx.get(tx.id) ?? [];
                  const inLeg  = legs.find((l) => l.direction === "in");
                  const outLeg = legs.find((l) => l.direction === "out");
                  const typeColor = tx.transactionType
                    ? (TYPE_COLORS[tx.transactionType] ?? "var(--text-2)")
                    : "var(--text-2)";
                  return (
                    <tr key={tx.id} style={{ borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: "var(--text-3)", width: "140px" }}>
                        {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-3" style={{ width: "120px" }}>
                        {tx.transactionType && (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: typeColor + "22", color: typeColor }}>
                            {tx.transactionType}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {inLeg && (
                          <span style={{ color: "var(--accent)" }}>
                            +{Number(inLeg.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {inLeg.currency}
                          </span>
                        )}
                        {inLeg && outLeg && <span className="mx-1.5" style={{ color: "var(--text-3)" }}>·</span>}
                        {outLeg && (
                          <span style={{ color: "var(--red)" }}>
                            -{Number(outLeg.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {outLeg.currency}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right w-8">
                        <Link href="/app/transactions" className="text-[10px] transition-colors" style={{ color: "var(--text-3)" }}>→</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
