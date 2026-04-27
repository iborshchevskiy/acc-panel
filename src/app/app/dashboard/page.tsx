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
    [{ reviewCount }],
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

    // "Under review" = blockchain-imported Trade with no user-set type, no
    // status, no client assignment. Same logic as the REVIEW badge in the
    // transactions table (kept in sync with TransactionTable.tsx).
    db.execute(sql`
      SELECT count(*)::int AS "reviewCount"
      FROM transactions t
      WHERE t.organization_id = ${orgId}
        AND t.deleted_at IS NULL
        AND t.type = 'Trade'
        AND t.status IS NULL
        AND (
          t.transaction_type IS NULL
          OR t.transaction_type NOT IN (
            SELECT name FROM org_transaction_types
            WHERE organization_id = ${orgId}
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM transaction_clients tc
          WHERE tc.transaction_id = t.id
        )
    `) as unknown as Promise<Array<{ reviewCount: number }>>,

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

  const periodLabel = preset === "all" ? "All-time" : preset === "custom" ? `${fromStr} → ${toStr}` : preset.toUpperCase();

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
            className="h-7 px-2.5 flex items-center rounded text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-4)" }}
          >
            Analytics →
          </Link>
        </div>
      </div>

      {/* ── HERO: Period P&L ────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-4 pt-4 pb-1 flex items-center justify-between sm:px-5 sm:pt-5">
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
            Net P&amp;L · {periodLabel}
          </p>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>Exchange</span>
        </div>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {mtdNetFlowRows.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-1 text-center">
              <p className="text-sm" style={{ color: "var(--text-3)" }}>No exchanges in this period</p>
              <p className="text-[11px]" style={{ color: "var(--text-4)" }}>Try a wider date range</p>
            </div>
          ) : (
            <>
              {/* Mobile: horizontal currency tiles (3-up grid; scrollable if many) */}
              <div className="mt-3 flex gap-2 overflow-x-auto sm:hidden -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {mtdNetFlowRows.slice(0, 6).map((r) => {
                  const v = parseFloat(r.net_flow);
                  const allTime = allTimeByCurrency.get(r.currency) ?? 0;
                  const positive = v >= 0;
                  return (
                    <div key={r.currency}
                      className="shrink-0 basis-[calc((100%-1rem)/3)] min-w-[100px] rounded-lg px-2.5 py-2 flex flex-col"
                      style={{
                        backgroundColor: positive ? "var(--green-chip-bg)" : "var(--red-chip-bg)",
                        border: `1px solid ${positive ? "var(--green-border-lo)" : "var(--red-border-lo)"}`,
                      }}>
                      <span className="font-[family-name:var(--font-ibm-plex-mono)] text-base font-medium leading-none tabular-nums truncate"
                        style={{ color: positive ? "var(--accent)" : "var(--red)" }}>
                        {fmt(v)}
                      </span>
                      <span className="mt-1 text-[10px] font-medium" style={{ color: "var(--text-3)" }}>{r.currency}</span>
                      <span className="mt-1.5 text-[9px] font-mono tabular-nums truncate" style={{ color: "var(--text-4)" }}>
                        all {fmt(allTime)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: stacked rows with hero number */}
              <div className="mt-3 hidden sm:flex flex-col gap-3">
                {mtdNetFlowRows.slice(0, 5).map((r, idx) => {
                  const v = parseFloat(r.net_flow);
                  const allTime = allTimeByCurrency.get(r.currency) ?? 0;
                  const isHero = idx === 0;
                  return (
                    <div key={r.currency} className="flex items-baseline justify-between gap-3">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span
                          className={`font-[family-name:var(--font-ibm-plex-mono)] font-medium leading-none tabular-nums ${isHero ? "text-4xl" : "text-base"}`}
                          style={{ color: v >= 0 ? "var(--accent)" : "var(--red)" }}
                        >
                          {fmt(v)}
                        </span>
                        <span className={`font-medium ${isHero ? "text-sm" : "text-xs"}`} style={{ color: "var(--text-4)" }}>
                          {r.currency}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums shrink-0 text-right" style={{ color: "var(--text-4)" }}>
                        <span className="opacity-60">all · </span>{fmt(allTime)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Under-review alert (mobile only — desktop uses KPI card below) ─── */}
      {reviewCount > 0 && (
        <Link href="/app/transactions?review=1"
          className="sm:hidden rounded-xl flex items-center gap-3 px-4 py-3 active:opacity-70 transition-opacity"
          style={{
            backgroundColor: "color-mix(in srgb, var(--amber) 9%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--amber) 32%, var(--border))",
          }}>
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, var(--amber) 18%, transparent)" }}>
            {/* Pulsing dot to mirror the REVIEW badge in the table */}
            <span className="absolute inline-flex h-2 w-2 rounded-full opacity-75 animate-ping"
              style={{ backgroundColor: "var(--amber)", top: 6, right: 6 }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--amber)" }}>
              <path d="M11 4a8 8 0 1 1-8 8" />
              <path d="M3 4v5h5" />
              <path d="M12 8v4l3 2" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
              {reviewCount.toLocaleString()} transaction{reviewCount === 1 ? "" : "s"} under review
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Tap to add type, status, or client</p>
          </div>
          <span className="text-xs shrink-0" style={{ color: "var(--text-4)" }}>→</span>
        </Link>
      )}

      {/* ── Net positions ───────────────────────────────────────────────────── */}
      {netPositionRows.length > 0 && (
        <div className="rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex flex-col gap-2 px-4 pt-3 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:pt-4">
            <div className="flex items-center gap-3 flex-wrap">
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
              <div className="hidden sm:flex items-center gap-3 text-[10px]" style={{ color: "var(--text-3)" }}>
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

          {/* Mobile: each currency = full-width row (stacked actual/projected when differ) */}
          <ul className="flex flex-col px-2 pb-2 sm:hidden">
            {netPositionRows.map((pos) => {
              const actual    = parseFloat(pos.actual);
              const projected = parseFloat(pos.projected);
              const hasDiff   = Math.abs(actual - projected) > 0.0001;
              const positive  = projected >= 0;
              return (
                <li key={pos.currency}
                  className="flex items-center justify-between gap-3 px-2 py-2.5"
                  style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm font-medium tracking-wide" style={{ color: "var(--text-2)" }}>
                    {pos.currency}
                  </span>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-[family-name:var(--font-ibm-plex-mono)] text-base font-medium tabular-nums leading-none"
                      style={{ color: positive ? "var(--accent)" : "var(--red)" }}>
                      {fmt(projected)}
                    </span>
                    {hasDiff && (
                      <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--amber)" }}>
                        actual {fmt(actual)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: chip cluster (existing design) */}
          <div className="hidden sm:flex flex-wrap gap-3 px-4 pb-4">
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

      {/* ── Stats footer (mobile-only secondary metrics) ────────────────────── */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <div className="rounded-lg px-3 py-2.5"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="font-[family-name:var(--font-ibm-plex-mono)] text-base font-medium leading-none"
            style={{ color: "var(--indigo)" }}>{mtdExchangeCount.toLocaleString()}</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>exch. MTD</p>
        </div>
        <div className="rounded-lg px-3 py-2.5"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="font-[family-name:var(--font-ibm-plex-mono)] text-base font-medium leading-none"
            style={{ color: "var(--amber)" }}>{walletCount}</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>wallets</p>
        </div>
        <div className="rounded-lg px-3 py-2.5"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="font-[family-name:var(--font-ibm-plex-mono)] text-base font-medium leading-none"
            style={{ color: "var(--amber)" }}>{clientCount}</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-4)" }}>clients</p>
        </div>
      </div>

      {/* ── Desktop secondary KPI strip (hidden on mobile) ──────────────────── */}
      <div className="hidden sm:grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--indigo)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Exchanges MTD</p>
          <p className="mt-2.5 font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium leading-none" style={{ color: "var(--indigo)" }}>
            {mtdExchangeCount.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>{txCount.toLocaleString()} all-time</p>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: "2px solid var(--amber)" }}>
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Wallets / Clients</p>
          <p className="mt-2.5 leading-none">
            <span className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium" style={{ color: "var(--amber)" }}>{walletCount}</span>
            <span className="mx-2 text-lg" style={{ color: "var(--text-3)", opacity: 0.4 }}>/</span>
            <span className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium" style={{ color: "var(--amber)" }}>{clientCount}</span>
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>addresses · counterparties</p>
        </div>
        <Link href={reviewCount > 0 ? "/app/transactions?review=1" : "/app/transactions"}
          className="rounded-xl p-4 transition-all hover:translate-y-[-1px]"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: `2px solid ${reviewCount > 0 ? "var(--amber)" : "var(--text-3)"}`,
          }}>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Under Review</p>
            {reviewCount > 0 && (
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                  style={{ backgroundColor: "var(--amber)" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5"
                  style={{ backgroundColor: "var(--amber)" }} />
              </span>
            )}
          </div>
          <p className="mt-2.5 font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium leading-none"
            style={{ color: reviewCount > 0 ? "var(--amber)" : "var(--text-2)" }}>
            {reviewCount.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
            {reviewCount === 0 ? "all reviewed ✓" : "needs attention"}
          </p>
        </Link>
      </div>

      {/* ── Exchange Volume by currency ─────────────────────────────────────── */}
      {exchangeVolumeRows.length > 0 && (
        <details className="rounded-xl overflow-hidden group" style={{ border: "1px solid var(--border)" }}>
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            style={{ backgroundColor: "var(--surface)" }}>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>
                Exchange Volume
              </p>
              <span className="text-[10px] sm:hidden" style={{ color: "var(--text-3)" }}>
                {exchangeVolumeRows.length} cur.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="hidden sm:block text-[10px]" style={{ color: "var(--text-3)" }}>all-time · income + outcome per currency</p>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="sm:hidden transition-transform group-open:rotate-180"
                style={{ color: "var(--text-3)" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </summary>
          <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
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
        </details>
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
