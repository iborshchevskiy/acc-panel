import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, sql, isNull, gte, lte } from "drizzle-orm";
import RefreshButton from "@/components/refresh-button";
import CustomRangePicker from "./CustomRangePicker";

interface PageProps {
  searchParams: Promise<{ bucket?: string; from?: string; to?: string }>;
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
  const isCustom = params.bucket === "custom";
  const bucket = isCustom ? "day" : (params.bucket ?? "month") as "day" | "week" | "month";
  const customFrom = params.from ?? "";
  const customTo = params.to ?? "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/app/onboarding");
  const orgId = membership.organizationId;

  // ── Date range filter (for custom bucket) ────────────────────────────────
  const dateConditions = isCustom && customFrom && customTo
    ? [gte(transactions.timestamp, new Date(customFrom)), lte(transactions.timestamp, new Date(customTo + "T23:59:59"))]
    : [];

  // ── Summary counts (cheap COUNT queries) ─────────────────────────────────
  const [[{ totalTxs }], [{ exchangeTxs }]] = await Promise.all([
    db.select({ totalTxs: sql<number>`count(*)::int` }).from(transactions)
      .where(and(eq(transactions.organizationId, orgId), isNull(transactions.deletedAt), ...dateConditions)),
    db.select({ exchangeTxs: sql<number>`count(*)::int` }).from(transactions)
      .where(and(eq(transactions.organizationId, orgId), eq(transactions.transactionType, "Exchange"), isNull(transactions.deletedAt), ...dateConditions)),
  ]);

  // ── Fiat set for this org ────────────────────────────────────────────────
  const fiatRows = await db.select({ code: currencies.code }).from(currencies)
    .where(and(eq(currencies.organizationId, orgId), eq(currencies.type, "fiat")));
  const fiatList = fiatRows.map((r) => r.code);

  // ── Period P&L — aggregated in SQL, returns O(periods × currencies) rows ─
  const dateTruncFn = bucket === "month" ? "month" : bucket === "week" ? "week" : "day";
  const dateTruncFmt = bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const dateTruncExpr = sql.raw(`TO_CHAR(DATE_TRUNC('${dateTruncFn}', t.timestamp), '${dateTruncFmt}')`);

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
      AND t.deleted_at IS NULL
      AND t.transaction_type IN ('Exchange', 'Revenue')
      AND tl.direction IN ('in', 'out')
      AND tl.currency IS NOT NULL
      ${isCustom && customFrom ? sql`AND t.timestamp >= ${new Date(customFrom)}` : sql``}
      ${isCustom && customTo ? sql`AND t.timestamp <= ${new Date(customTo + "T23:59:59")}` : sql``}
    GROUP BY 1, 2, 3, 4
    ORDER BY 1
  `) as unknown as PeriodAgg[];

  // Trade count per period — independent of leg join, so multi-currency Exchange
  // txs aren't undercounted (audit Bug A1: April 2026 had 79 real Exchange txs
  // but the per-leg max(distinct) gave 50 because EUR-in and CZK-in are
  // disjoint sets of txs).
  const periodCountAggs = await db.execute(sql`
    SELECT ${dateTruncExpr} AS period,
           COUNT(DISTINCT t.id)::int AS trade_count
      FROM ${transactions} t
     WHERE t.organization_id = ${orgId}
       AND t.deleted_at IS NULL
       AND t.transaction_type = 'Exchange'
       ${isCustom && customFrom ? sql`AND t.timestamp >= ${new Date(customFrom)}` : sql``}
       ${isCustom && customTo ? sql`AND t.timestamp <= ${new Date(customTo + "T23:59:59")}` : sql``}
     GROUP BY 1
  `) as unknown as Array<{ period: string; trade_count: number }>;
  const tradeCountByPeriod = new Map(periodCountAggs.map((r) => [r.period, r.trade_count]));

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
        exchangePnl: {}, revenue: {}, volume: {}, tradeCount: tradeCountByPeriod.get(row.period) ?? 0,
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
  // Audit Bug A2: the previous JOIN-on-legs cross-multiplied multi-leg txs
  // (e.g. tx 1130ed04 with 2 in + 2 out legs produced 4 rows, blowing up
  // counts and skewing AVG). Audit also caught arithmetic-mean rates instead
  // of volume-weighted (VWAP) — for an exchanger, VWAP is the only honest
  // average rate.
  //
  // Fix: pre-aggregate same-currency same-direction legs per tx in a CTE,
  // restrict to txs that are 1×1 fiat/non-fiat after netting (multi-currency
  // Exchanges are FIFO's domain, not spread analysis), then use VWAP per side.

  let spreadAggs: SpreadAgg[] = [];
  if (fiatList.length > 0) {
    const fiatArray = sql`ARRAY[${sql.raw(fiatList.map((f) => `'${f.replace(/'/g, "''")}'`).join(","))}]::text[]`;

    spreadAggs = await db.execute(sql`
      WITH per_tx_dir AS (
        SELECT t.id,
               tl.direction,
               tl.currency,
               SUM(tl.amount::numeric) AS amount
          FROM ${transactions} t
          JOIN ${transactionLegs} tl ON tl.transaction_id = t.id
         WHERE t.organization_id = ${orgId}
           AND t.deleted_at IS NULL
           AND t.transaction_type = 'Exchange'
           AND tl.direction IN ('in','out')
           AND tl.currency IS NOT NULL
           ${isCustom && customFrom ? sql`AND t.timestamp >= ${new Date(customFrom)}` : sql``}
           ${isCustom && customTo ? sql`AND t.timestamp <= ${new Date(customTo + "T23:59:59")}` : sql``}
         GROUP BY t.id, tl.direction, tl.currency
      ),
      single_pair AS (
        -- Keep only txs with exactly one in-currency and one out-currency
        -- after netting. Multi-currency Exchanges (e.g. paid USDT for EUR + CZK)
        -- are intentionally excluded — their per-side rate is ambiguous and
        -- belongs to FIFO's domain, not the spread report.
        SELECT id,
               MAX(CASE WHEN direction='in'  THEN currency END) AS in_cur,
               MAX(CASE WHEN direction='in'  THEN amount   END) AS in_amt,
               MAX(CASE WHEN direction='out' THEN currency END) AS out_cur,
               MAX(CASE WHEN direction='out' THEN amount   END) AS out_amt
          FROM per_tx_dir
         GROUP BY id
        HAVING COUNT(*) FILTER (WHERE direction='in')  = 1
           AND COUNT(*) FILTER (WHERE direction='out') = 1
      ),
      classified AS (
        SELECT
          CASE WHEN in_cur = ANY(${fiatArray}) THEN out_cur || '/' || in_cur
               ELSE in_cur || '/' || out_cur END AS pair,
          CASE WHEN in_cur = ANY(${fiatArray}) THEN 'SELL' ELSE 'BUY' END AS side,
          -- Always express rate as fiat-per-non-fiat (e.g. CZK per USDT).
          CASE WHEN in_cur = ANY(${fiatArray})
               THEN in_amt    -- fiat received
               ELSE out_amt   -- fiat paid
          END AS fiat_amt,
          CASE WHEN in_cur = ANY(${fiatArray})
               THEN out_amt   -- non-fiat paid
               ELSE in_amt    -- non-fiat received
          END AS base_amt
          FROM single_pair
         WHERE (in_cur  = ANY(${fiatArray}) AND NOT out_cur = ANY(${fiatArray}))
            OR (out_cur = ANY(${fiatArray}) AND NOT in_cur  = ANY(${fiatArray}))
      )
      SELECT pair,
             side,
             (SUM(fiat_amt) / NULLIF(SUM(base_amt), 0))::text AS avg_rate,  -- VWAP
             COUNT(*)::text AS trade_count,
             SUM(fiat_amt)::text AS volume
        FROM classified
       GROUP BY pair, side
       ORDER BY SUM(fiat_amt) DESC
       LIMIT 20
    `) as unknown as SpreadAgg[];
  }

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
    .where(and(eq(transactions.organizationId, orgId), eq(transactionLegs.direction, "fee"), isNull(transactions.deletedAt), ...dateConditions))
    .groupBy(transactionLegs.currency);

  // ── Activity heatmap: trades by day-of-week × hour-of-day ────────────────
  const heatmapRows = await db.execute(sql`
    SELECT EXTRACT(DOW  FROM t.timestamp)::int AS dow,
           EXTRACT(HOUR FROM t.timestamp)::int AS hr,
           COUNT(*)::int AS n
      FROM ${transactions} t
     WHERE t.organization_id = ${orgId}
       AND t.deleted_at IS NULL
       AND t.transaction_type = 'Exchange'
       ${isCustom && customFrom ? sql`AND t.timestamp >= ${new Date(customFrom)}` : sql``}
       ${isCustom && customTo ? sql`AND t.timestamp <= ${new Date(customTo + "T23:59:59")}` : sql``}
     GROUP BY 1, 2
  `) as unknown as Array<{ dow: number; hr: number; n: number }>;

  // 7×24 grid: dow 0=Sun…6=Sat, hr 0…23. Reorder to Mon-first for display.
  const heatGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let heatMax = 0;
  for (const r of heatmapRows) {
    const dowMonFirst = r.dow === 0 ? 6 : r.dow - 1;
    heatGrid[dowMonFirst][r.hr] = r.n;
    if (r.n > heatMax) heatMax = r.n;
  }
  const heatHasData = heatMax > 0;

  // ── Aggregate KPIs ───────────────────────────────────────────────────────
  // Volume-weighted average margin% across pairs that have both buy + sell.
  let weightedMarginNum = 0;
  let weightedMarginDen = 0;
  for (const s of [...spreadMap.values()]) {
    if (s.marginPct == null) continue;
    const pairAgg = spreadAggs.find((a) => a.pair === s.pair);
    if (!pairAgg) continue;
    const vol = parseFloat(pairAgg.volume) || 0;
    weightedMarginNum += s.marginPct * vol;
    weightedMarginDen += vol;
  }
  const avgMargin = weightedMarginDen > 0 ? weightedMarginNum / weightedMarginDen : null;

  // MoM change: compare last full bucket vs previous bucket on tradeCount.
  const last = periods[periods.length - 1];
  const prev = periods[periods.length - 2];
  const tradeCountDelta = last && prev && prev.tradeCount > 0
    ? ((last.tradeCount - prev.tradeCount) / prev.tradeCount) * 100
    : null;


  // ── Visualization helpers ────────────────────────────────────────────────
  // Build a tiny SVG line+area path for a series of values normalised to a
  // fixed viewBox. Returns the path strings; the parent SVG controls colour.
  function sparklinePaths(values: number[], width: number, height: number) {
    if (values.length === 0 || values.every((v) => v === 0)) return null;
    const max = Math.max(...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const ys = values.map((v) => height - ((v - min) / range) * height);
    const linePoints = values.map((_, i) => `${(i * step).toFixed(2)},${ys[i].toFixed(2)}`);
    const line = `M ${linePoints.join(" L ")}`;
    const area = `${line} L ${(width).toFixed(2)},${height} L 0,${height} Z`;
    return { line, area };
  }

  // Top 3 currencies by volume — used in the timeline chart.
  const timelineCurrencies = topCurrencies.slice(0, 3);
  const seriesPalette = ["var(--indigo)", "var(--accent)", "var(--amber)"];
  const totalPeriodVolume = periods.reduce((s, p) => s + Object.values(p.volume).reduce((a, b) => a + b, 0), 0);

  // Per-currency volume share (for the Currency Mix bars).
  const grandVolume = [...totalVolume.values()].reduce((a, b) => a + b, 0);
  const currencyMix = [...totalVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cur, vol]) => ({ cur, vol, share: grandVolume > 0 ? vol / grandVolume : 0 }));

  // Max margin% for visual normalisation in the spread cards.
  const maxAbsMargin = spreads.reduce((m, s) =>
    s.marginPct != null ? Math.max(m, Math.abs(s.marginPct)) : m, 0) || 1;

  // For period sparkline column: normalise volume bars to the largest bucket.
  const maxBucketVolume = periods.reduce(
    (m, p) => Math.max(m, Object.values(p.volume).reduce((a, b) => a + b, 0)),
    0
  );

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const DAYS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6" style={{ color: "var(--text-1)" }}>

      {/* ── REPORT MASTHEAD ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium tracking-[0.2em] uppercase" style={{ color: "var(--text-4)" }}>
            Analytics Report
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
            {isCustom && customFrom && customTo
              ? `${customFrom} → ${customTo}`
              : `${bucket[0].toUpperCase()}${bucket.slice(1)}ly view`}
          </h1>
          <p className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
            {totalTxs.toLocaleString()} transactions · {exchangeTxs.toLocaleString()} exchanges · {periods.length} {bucket}
            {periods.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--raised-hi)" }}>
            {(["day", "week", "month"] as const).map((b) => (
              <a key={b} href={`?bucket=${b}`}
                className="h-7 px-3 flex items-center rounded text-xs font-medium transition-colors capitalize"
                style={!isCustom && bucket === b
                  ? { backgroundColor: "var(--accent)", color: "var(--surface)" }
                  : { color: "var(--text-2)" }}>
                {b}
              </a>
            ))}
            <CustomRangePicker active={isCustom} initialFrom={customFrom} initialTo={customTo} />
          </div>
        </div>
      </header>

      {/* ── KPI STRIP ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Exchange Trades"
          value={exchangeTxs.toLocaleString()}
          delta={tradeCountDelta}
          deltaLabel="vs prev"
          accent="var(--indigo)"
        />
        <KpiCard
          label="Top Volume"
          value={topCurrencies[0]
            ? (totalVolume.get(topCurrencies[0]) ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
            : "—"}
          sub={topCurrencies[0] ?? "no data"}
          accent="var(--accent)"
        />
        <KpiCard
          label="Avg Margin"
          value={avgMargin != null ? `${avgMargin >= 0 ? "+" : ""}${avgMargin.toFixed(2)}%` : "—"}
          sub="vol-weighted across pairs"
          accent={avgMargin != null && avgMargin >= 0 ? "var(--accent)" : "var(--red)"}
          valueColor={avgMargin != null ? (avgMargin >= 0 ? "var(--accent)" : "var(--red)") : undefined}
        />
        <KpiCard
          label="Fees Paid"
          value={feeRows[0]
            ? `${parseFloat(feeRows[0].total ?? "0").toLocaleString(undefined, { maximumFractionDigits: 4 })}`
            : "—"}
          sub={feeRows[0] ? `${feeRows[0].currency}${feeRows.length > 1 ? ` +${feeRows.length - 1} more` : ""}` : "no fees"}
          accent="var(--amber)"
        />
      </section>

      {/* ── VOLUME TIMELINE ─────────────────────────────────────────────── */}
      {periods.length > 0 && timelineCurrencies.length > 0 && (
        <section className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <h2 className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Volume Timeline</h2>
              <p className="text-[10px]" style={{ color: "var(--text-4)" }}>
                top {timelineCurrencies.length} currencies · {periods.length} {bucket}{periods.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {timelineCurrencies.map((c, idx) => (
                <span key={c} className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: seriesPalette[idx] }} />
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3">
            {timelineCurrencies.map((c, idx) => {
              const series = periods.map((p) => p.volume[c] ?? 0);
              const max = Math.max(...series);
              const total = series.reduce((s, v) => s + v, 0);
              const paths = sparklinePaths(series, 600, 80);
              const color = seriesPalette[idx];
              return (
                <div key={c} className="px-4 py-4 flex flex-col gap-2" style={{
                  borderRight: idx < timelineCurrencies.length - 1 ? "1px solid var(--border)" : "none",
                  borderTop: idx > 0 ? "1px solid var(--border)" : "none",
                }}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{c}</span>
                    <span className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
                      peak {max.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <p className="font-[family-name:var(--font-ibm-plex-mono)] text-xl font-medium leading-none" style={{ color }}>
                    {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  {paths && (
                    <svg viewBox="0 0 600 80" className="w-full mt-1" preserveAspectRatio="none" style={{ height: 56 }}>
                      <defs>
                        <linearGradient id={`grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                          <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={paths.area} fill={`url(#grad-${c})`} />
                      <path d={paths.line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                  )}
                  <div className="flex items-center justify-between text-[9px] font-mono" style={{ color: "var(--text-4)" }}>
                    <span>{periods[0]?.label}</span>
                    <span>{periods[periods.length - 1]?.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── CURRENCY MIX + PAIR PERFORMANCE side by side on desktop ─────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Currency mix bars */}
        {currencyMix.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Currency Mix</h2>
              <span className="text-[10px]" style={{ color: "var(--text-4)" }}>by raw volume share</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {currencyMix.map(({ cur, vol, share }) => (
                <div key={cur} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium" style={{ color: "var(--text-2)" }}>{cur}</span>
                    <span className="font-mono" style={{ color: "var(--text-3)" }}>
                      {vol.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <span className="ml-2" style={{ color: "var(--text-4)" }}>{(share * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--raised)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.max(2, share * 100)}%`,
                      backgroundColor: "var(--accent)",
                      opacity: 0.4 + share * 0.6,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pair performance — visual margin bars */}
        {spreads.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Pair Margin</h2>
              <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
                buy → sell vwap · margin% bar normalised
              </span>
            </div>
            <div className="flex flex-col">
              {spreads.slice(0, 8).map((s, i) => {
                const m = s.marginPct ?? 0;
                const widthPct = Math.min(100, (Math.abs(m) / maxAbsMargin) * 100);
                const isPos = m >= 0;
                return (
                  <div key={s.pair} className="px-4 py-3 flex flex-col gap-1.5"
                    style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-mono" style={{ color: "var(--text-2)" }}>{s.pair}</span>
                      <span className="text-xs font-mono"
                        style={{ color: s.marginPct == null ? "var(--text-4)" : isPos ? "var(--accent)" : "var(--red)" }}>
                        {s.marginPct != null ? `${isPos ? "+" : ""}${m.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
                      <span>
                        buy {s.avgBuy != null ? s.avgBuy.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                        <span className="mx-1.5">→</span>
                        sell {s.avgSell != null ? s.avgSell.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                      </span>
                      <span>{s.buyCount} / {s.sellCount}</span>
                    </div>
                    <div className="relative h-1 rounded-full" style={{ backgroundColor: "var(--raised)" }}>
                      <div className="absolute top-0 bottom-0 rounded-full" style={{
                        width: `${widthPct}%`,
                        left: isPos ? "50%" : `${50 - widthPct}%`,
                        backgroundColor: isPos ? "var(--accent)" : "var(--red)",
                      }} />
                      <div className="absolute top-0 bottom-0" style={{
                        left: "50%",
                        width: 1,
                        backgroundColor: "color-mix(in srgb, var(--text-1) 18%, transparent)",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── PERIOD BREAKDOWN ────────────────────────────────────────────── */}
      <section className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            {isCustom && customFrom && customTo ? `Breakdown: ${customFrom} – ${customTo}` : `${bucket[0].toUpperCase()}${bucket.slice(1)}ly Breakdown`}
          </h2>
          <span className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
            net flow per top currency · period volume bar
          </span>
        </div>
        {periods.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--text-4)" }}>
            No Exchange transactions in this range
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Period</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Trades</th>
                  {topCurrencies.map((c) => (
                    <th key={c} className="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>Net {c}</th>
                  ))}
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)", width: 160 }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...periods].reverse().map((p, i, arr) => {
                  const periodVolume = Object.values(p.volume).reduce((a, b) => a + b, 0);
                  const volBar = maxBucketVolume > 0 ? periodVolume / maxBucketVolume : 0;
                  return (
                    <tr key={p.period} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--text-2)" }}>{p.label}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-right" style={{ color: "var(--text-3)" }}>{p.tradeCount}</td>
                      {topCurrencies.map((c) => {
                        const v = p.exchangePnl[c] ?? 0;
                        return (
                          <td key={c} className="px-4 py-2.5 text-xs font-mono text-right">
                            {v !== 0 ? (
                              <span style={{ color: v > 0 ? "var(--accent)" : "var(--red)" }}>
                                {v > 0 ? "+" : ""}{v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                            ) : <span style={{ color: "var(--text-4)" }}>—</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--raised)" }}>
                            <div className="h-full rounded-full" style={{
                              width: `${Math.max(2, volBar * 100)}%`,
                              backgroundColor: "var(--indigo)",
                              opacity: 0.5 + volBar * 0.5,
                            }} />
                          </div>
                          <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-4)" }}>
                            {periodVolume > 0 ? periodVolume.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--raised-hi)" }}>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: "var(--text-2)" }}>Total</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-right" style={{ color: "var(--text-2)" }}>
                    {periods.reduce((s, p) => s + p.tradeCount, 0)}
                  </td>
                  {topCurrencies.map((c) => {
                    const v = totalExchangePnl.get(c) ?? 0;
                    return (
                      <td key={c} className="px-4 py-2.5 text-xs font-mono font-medium text-right">
                        <span style={{ color: v > 0 ? "var(--accent)" : v < 0 ? "var(--red)" : "var(--text-4)" }}>
                          {v !== 0 ? `${v > 0 ? "+" : ""}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-[10px] font-mono text-right" style={{ color: "var(--text-3)" }}>
                    {totalPeriodVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── ACTIVITY HEATMAP ────────────────────────────────────────────── */}
      {heatHasData && (
        <section className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <h2 className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Activity Heatmap</h2>
            <span className="text-[10px] font-mono" style={{ color: "var(--text-4)" }}>
              trades by day-of-week × hour · UTC · max {heatMax}
            </span>
          </div>
          <div className="px-4 py-4 overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Hour ruler */}
              <div className="flex pl-9">
                {HOURS.map((h) => (
                  <div key={h} className="flex-1 min-w-[14px] text-center text-[8px] font-mono"
                    style={{ color: "var(--text-4)" }}>
                    {h % 3 === 0 ? h.toString().padStart(2, "0") : ""}
                  </div>
                ))}
              </div>
              {/* Rows */}
              <div className="flex flex-col gap-0.5 mt-1.5">
                {DAYS_MON.map((day, dIdx) => (
                  <div key={day} className="flex items-center gap-1">
                    <span className="w-7 text-[10px] font-mono text-right" style={{ color: "var(--text-4)" }}>{day}</span>
                    <div className="flex flex-1 gap-0.5">
                      {HOURS.map((h) => {
                        const v = heatGrid[dIdx][h];
                        const intensity = heatMax > 0 ? v / heatMax : 0;
                        return (
                          <div key={h} className="flex-1 min-w-[12px] rounded-sm"
                            title={`${day} ${h.toString().padStart(2, "0")}:00 — ${v} trade${v === 1 ? "" : "s"}`}
                            style={{
                              height: 18,
                              backgroundColor: v === 0
                                ? "color-mix(in srgb, var(--text-1) 4%, transparent)"
                                : `color-mix(in srgb, var(--accent) ${10 + intensity * 80}%, transparent)`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 pl-9">
                <span className="text-[9px] font-mono" style={{ color: "var(--text-4)" }}>quiet</span>
                <div className="flex gap-0.5">
                  {[0.05, 0.2, 0.45, 0.7, 0.9].map((step) => (
                    <div key={step} className="rounded-sm"
                      style={{
                        width: 12, height: 12,
                        backgroundColor: `color-mix(in srgb, var(--accent) ${10 + step * 80}%, transparent)`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-[9px] font-mono" style={{ color: "var(--text-4)" }}>busy</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── FEES PANEL ──────────────────────────────────────────────────── */}
      {feeRows.length > 0 && (
        <section className="rounded-xl px-4 py-4" style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Fees Paid</h2>
            <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{feeRows.length} currenc{feeRows.length === 1 ? "y" : "ies"}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {feeRows.map((f) => (
              <div key={f.currency} className="rounded-lg px-3 py-2.5"
                style={{ backgroundColor: "var(--raised)", border: "1px solid var(--inner-border)" }}>
                <p className="text-[10px] font-medium tracking-wider uppercase" style={{ color: "var(--text-4)" }}>{f.currency}</p>
                <p className="mt-1 font-[family-name:var(--font-ibm-plex-mono)] text-base font-medium" style={{ color: "var(--amber)" }}>
                  {parseFloat(f.total ?? "0").toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Tiny components ────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, delta, deltaLabel, accent, valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
  accent: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1.5"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderTop: `2px solid ${accent}` }}>
      <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--text-4)" }}>{label}</p>
      <p className="font-[family-name:var(--font-ibm-plex-mono)] text-2xl font-medium leading-none"
        style={{ color: valueColor ?? "var(--text-1)" }}>
        {value}
      </p>
      <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-4)" }}>
        <span>{sub ?? ""}</span>
        {delta != null && Number.isFinite(delta) && (
          <span style={{ color: delta >= 0 ? "var(--accent)" : "var(--red)" }} className="font-mono">
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% {deltaLabel ?? ""}
          </span>
        )}
      </div>
    </div>
  );
}
