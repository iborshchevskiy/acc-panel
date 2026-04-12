import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { wallets } from "@/db/schema/wallets";
import { clients } from "@/db/schema/clients";
import { organizationMembers, organizations } from "@/db/schema/system";
import { eq, and, desc, sql, inArray, isNull, gte, lt } from "drizzle-orm";

export const metadata = { title: "Dashboard — AccPanel" };

const TYPE_COLORS: Record<string, string> = {
  Exchange: "var(--indigo)",
  Revenue: "var(--accent)",
  Expense: "var(--red)",
  Debt: "var(--amber)",
  Transfer: "var(--text-2)",
  Fee: "var(--violet)",
};

export default async function DashboardPage() {
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
  const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  // ── First batch: all independent queries ────────────────────────────────────
  const [
    [{ txCount }],
    [{ walletCount }],
    [{ clientCount }],
    [{ unmatchedCount }],
    [{ mtdExchangeCount }],
    mtdRevenueRows,
    prevRevenueRows,
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

    // MTD Revenue by currency
    db.select({
      currency: transactionLegs.currency,
      total: sql<string>`SUM(${transactionLegs.amount}::numeric)::text`,
    })
      .from(transactionLegs)
      .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
      .where(and(
        eq(transactions.organizationId, orgId),
        eq(transactionLegs.direction, "in"),
        eq(transactions.transactionType, "Revenue"),
        isNull(transactions.deletedAt),
        gte(transactions.timestamp, mtdStart),
      ))
      .groupBy(transactionLegs.currency)
      .orderBy(sql`SUM(${transactionLegs.amount}::numeric) DESC`)
      .limit(3),

    // Prior month Revenue by currency
    db.select({
      currency: transactionLegs.currency,
      total: sql<string>`SUM(${transactionLegs.amount}::numeric)::text`,
    })
      .from(transactionLegs)
      .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
      .where(and(
        eq(transactions.organizationId, orgId),
        eq(transactionLegs.direction, "in"),
        eq(transactions.transactionType, "Revenue"),
        isNull(transactions.deletedAt),
        gte(transactions.timestamp, prevMonthStart),
        lt(transactions.timestamp, mtdStart),
      ))
      .groupBy(transactionLegs.currency)
      .orderBy(sql`SUM(${transactionLegs.amount}::numeric) DESC`)
      .limit(3),

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

  // ── Second batch: depend on recentIds, run in parallel with net positions ──
  const recentIds = recent.map((r) => r.id);
  const [netPositionRows, recentLegs] = await Promise.all([
    db.execute(sql`
      SELECT
        tl.currency,
        (
          SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE 0 END) -
          SUM(CASE WHEN tl.direction = 'out' THEN tl.amount::numeric ELSE 0 END)
        )::text AS net
      FROM transaction_legs tl
      JOIN transactions t ON t.id = tl.transaction_id
      WHERE t.organization_id = ${orgId}
        AND t.deleted_at IS NULL
        AND tl.currency IS NOT NULL
        AND tl.direction IN ('in', 'out')
      GROUP BY tl.currency
      HAVING ABS(
        SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE 0 END) -
        SUM(CASE WHEN tl.direction = 'out' THEN tl.amount::numeric ELSE 0 END)
      ) > 0.0001
      ORDER BY ABS(
        SUM(CASE WHEN tl.direction = 'in' THEN tl.amount::numeric ELSE 0 END) -
        SUM(CASE WHEN tl.direction = 'out' THEN tl.amount::numeric ELSE 0 END)
      ) DESC
      LIMIT 8
    `) as unknown as Promise<Array<{ currency: string; net: string }>>,

    recentIds.length > 0
      ? db.select({
          transactionId: transactionLegs.transactionId,
          direction: transactionLegs.direction,
          amount: transactionLegs.amount,
          currency: transactionLegs.currency,
        })
        .from(transactionLegs)
        .where(inArray(transactionLegs.transactionId, recentIds))
      : Promise.resolve([]),
  ]);

  const legsByTx = new Map<string, typeof recentLegs>();
  for (const l of recentLegs) {
    const arr = legsByTx.get(l.transactionId) ?? [];
    arr.push(l);
    legsByTx.set(l.transactionId, arr);
  }

  // Revenue month-over-month comparison
  const topRevCurrency = mtdRevenueRows[0]?.currency ?? null;
  const mtdRevTotal = parseFloat(mtdRevenueRows[0]?.total ?? "0");
  const prevRevRow = prevRevenueRows.find((r) => r.currency === topRevCurrency);
  const prevRevTotal = parseFloat(prevRevRow?.total ?? "0");
  const revChangePct = prevRevTotal > 0 ? ((mtdRevTotal - prevRevTotal) / prevRevTotal) * 100 : null;

  const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>
            {org?.name ?? "Dashboard"}
          </h1>
          <p className="mt-0.5 text-xs font-mono" style={{ color: "var(--text-3)" }}>
            {monthName} {now.getUTCFullYear()} · {txCount.toLocaleString()} transactions
          </p>
        </div>
        <Link
          href="/app/analytics"
          className="h-7 px-3 flex items-center rounded text-xs font-medium transition-colors"
          style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-4)" }}
        >
          Full analytics →
        </Link>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">

        {/* MTD Revenue */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--accent)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>MTD Revenue</p>
          {topRevCurrency ? (
            <>
              <p className="mt-2.5 leading-none">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium" style={{ color: "var(--accent)" }}>
                  {mtdRevTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="ml-1.5 text-sm font-medium" style={{ color: "var(--accent)" }}>{topRevCurrency}</span>
              </p>
              {revChangePct !== null ? (
                <p className="mt-1.5 text-[11px] font-mono" style={{ color: revChangePct >= 0 ? "var(--accent)" : "var(--red)" }}>
                  {revChangePct >= 0 ? "▲" : "▼"} {Math.abs(revChangePct).toFixed(1)}% vs prior month
                </p>
              ) : (
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>first month on record</p>
              )}
            </>
          ) : (
            <p className="mt-2.5 text-sm" style={{ color: "var(--text-3)" }}>No revenue this month</p>
          )}
        </div>

        {/* MTD Exchanges */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--indigo)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Exchanges MTD</p>
          <p className="mt-2.5 font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium leading-none" style={{ color: "var(--indigo)" }}>
            {mtdExchangeCount.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            {txCount.toLocaleString()} all-time
          </p>
        </div>

        {/* Wallets / Clients */}
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--amber)" }}>
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
          className="rounded-xl p-4 transition-all hover:translate-y-[-1px]"
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
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
              Net Positions
            </p>
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>in − out · all-time</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {netPositionRows.map((pos) => {
              const net = parseFloat(pos.net);
              const isPositive = net >= 0;
              const absNet = Math.abs(net);
              const decimals = absNet > 10000 ? 0 : absNet > 1 ? 2 : 6;
              return (
                <div
                  key={pos.currency}
                  className="flex items-baseline gap-1.5 rounded-lg px-3 py-1.5"
                  style={{
                    backgroundColor: isPositive ? "var(--green-chip-bg)" : "var(--red-chip-bg)",
                    border: `1px solid ${isPositive ? "var(--green-border-lo)" : "var(--red-border-lo)"}`,
                  }}
                >
                  <span
                    className="font-[family-name:var(--font-ibm-plex-mono)] text-sm font-medium"
                    style={{ color: isPositive ? "var(--accent)" : "var(--red)" }}
                  >
                    {isPositive ? "+" : ""}{net.toLocaleString(undefined, { maximumFractionDigits: decimals })}
                  </span>
                  <span className="text-xs font-medium" style={{ color: "var(--text-4)" }}>{pos.currency}</span>
                </div>
              );
            })}
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
          <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
            <tbody>
              {recent.map((tx, i) => {
                const legs = legsByTx.get(tx.id) ?? [];
                const inLeg = legs.find((l) => l.direction === "in");
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
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: typeColor + "22", color: typeColor }}
                        >
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
                      {inLeg && outLeg && (
                        <span className="mx-1.5" style={{ color: "var(--text-3)" }}>·</span>
                      )}
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
      )}

    </div>
  );
}
