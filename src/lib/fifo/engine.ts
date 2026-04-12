/**
 * FIFO cost basis engine.
 * Lot tuple layout: [remaining, costRate, acquiredAt, txId, originalAmount]
 */

export interface FifoTxRow {
  id: string;
  timestamp: Date;
  transactionType: string | null;
  incomeAmount: string | null;
  incomeCurrency: string | null;
  outcomeAmount: string | null;
  outcomeCurrency: string | null;
}

export interface TaxLot {
  txId: string;
  acquiredAt: Date;
  originalAmount: number;
  remainingAmount: number;
  costRate: number; // fiat per crypto unit
}

export interface Disposal {
  txId: string;
  disposedAt: Date;
  amount: number;
  proceedsRate: number;
  costRate: number;
  gain: number;
  gainCurrency: string;
  lotAcquiredAt: Date | null;
}

export interface PairResult {
  pair: string;
  cryptoCurrency: string;
  fiatCurrency: string;
  lots: TaxLot[];
  disposals: Disposal[];
  totalAcquired: number;
  totalDisposed: number;
  currentHolding: number;
  avgCost: number | null;
  totalRealizedGain: number;
  gainCurrency: string;
}

export interface FifoResult {
  pairs: Record<string, PairResult>;
  summary: Array<{
    pair: string;
    currentHolding: number;
    avgCost: number | null;
    totalRealizedGain: number;
    gainCurrency: string;
    tradeCount: number;
  }>;
}

// Fallback — callers should pass org fiat currencies from DB
const DEFAULT_FIAT = new Set(["EUR", "USD", "CZK", "PLN", "GBP", "UAH", "RUB", "HUF", "RON"]);

// Lot tuple indices
const R = 0; // remaining
const C = 1; // costRate
const D = 2; // acquiredAt (Date)
const T = 3; // txId
const O = 4; // originalAmount

export function runFifo(rows: FifoTxRow[], fiatCurrencies?: Set<string>): FifoResult {
  const fiatSet = fiatCurrencies ?? DEFAULT_FIAT;
  const sorted = [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // pair → queue of lots: [remaining, costRate, acquiredAt, txId, originalAmount]
  const queues = new Map<string, Array<[number, number, Date, string, number]>>();
  const realized = new Map<string, Disposal[]>();
  const acquired = new Map<string, number>();
  const disposed = new Map<string, number>();
  const tradeCounts = new Map<string, number>();

  for (const row of sorted) {
    const txType = (row.transactionType ?? "").trim();
    if (txType !== "Exchange") continue;

    const incCur = (row.incomeCurrency ?? "").trim();
    const outCur = (row.outcomeCurrency ?? "").trim();
    const incAmt = parseFloat(row.incomeAmount ?? "0") || 0;
    const outAmt = parseFloat(row.outcomeAmount ?? "0") || 0;
    if (!incCur || !outCur || incAmt <= 0 || outAmt <= 0) continue;

    const incFiat = fiatSet.has(incCur);
    const outFiat = fiatSet.has(outCur);

    if (incFiat && !outFiat) {
      // SOLD crypto → income=fiat, outcome=crypto
      const pair = `${outCur}/${incCur}`;
      const proceedsRate = incAmt / outAmt;

      if (!queues.has(pair)) queues.set(pair, []);
      if (!realized.has(pair)) realized.set(pair, []);
      disposed.set(pair, (disposed.get(pair) ?? 0) + outAmt);
      tradeCounts.set(pair, (tradeCounts.get(pair) ?? 0) + 1);

      let toDispose = outAmt;
      const queue = queues.get(pair)!;

      while (toDispose > 1e-9 && queue.length > 0) {
        const lot = queue[0];
        const consumed = Math.min(lot[R], toDispose);
        realized.get(pair)!.push({
          txId: row.id,
          disposedAt: row.timestamp,
          amount: consumed,
          proceedsRate,
          costRate: lot[C],
          gain: (proceedsRate - lot[C]) * consumed,
          gainCurrency: incCur,
          lotAcquiredAt: lot[D],
        });
        lot[R] -= consumed;
        toDispose -= consumed;
        if (lot[R] <= 1e-9) queue.shift();
      }

      // Short sell / no remaining lots — proceeds with zero cost basis
      if (toDispose > 1e-9) {
        realized.get(pair)!.push({
          txId: row.id,
          disposedAt: row.timestamp,
          amount: toDispose,
          proceedsRate,
          costRate: 0,
          gain: proceedsRate * toDispose,
          gainCurrency: incCur,
          lotAcquiredAt: null,
        });
      }
    } else if (outFiat && !incFiat) {
      // BOUGHT crypto → outcome=fiat, income=crypto
      const pair = `${incCur}/${outCur}`;
      const costRate = outAmt / incAmt;

      if (!queues.has(pair)) queues.set(pair, []);
      // FIX: store originalAmount (incAmt) as 5th element — not derived from total acquired
      queues.get(pair)!.push([incAmt, costRate, row.timestamp, row.id, incAmt]);
      acquired.set(pair, (acquired.get(pair) ?? 0) + incAmt);
      tradeCounts.set(pair, (tradeCounts.get(pair) ?? 0) + 1);
    }
  }

  const pairs: Record<string, PairResult> = {};
  const allPairs = new Set([...queues.keys(), ...realized.keys()]);

  for (const pair of allPairs) {
    const [crypto, fiat] = pair.split("/");
    const queue = queues.get(pair) ?? [];
    const realizedList = realized.get(pair) ?? [];

    // FIX: use lot[O] (originalAmount) not total acquired for this pair
    const lots: TaxLot[] = queue.map((q) => ({
      txId: q[T],
      acquiredAt: q[D],
      originalAmount: q[O],
      remainingAmount: q[R],
      costRate: q[C],
    }));

    const currentHolding = queue.reduce((s, q) => s + q[R], 0);
    const totalRealizedGain = realizedList.reduce((s, d) => s + d.gain, 0);
    const totalLotValue = queue.reduce((s, q) => s + q[R] * q[C], 0);
    const avgCost = currentHolding > 1e-9 ? totalLotValue / currentHolding : null;

    pairs[pair] = {
      pair,
      cryptoCurrency: crypto,
      fiatCurrency: fiat,
      lots,
      disposals: realizedList,
      totalAcquired: acquired.get(pair) ?? 0,
      totalDisposed: disposed.get(pair) ?? 0,
      currentHolding,
      avgCost,
      totalRealizedGain,
      gainCurrency: fiat,
    };
  }

  const summary = Object.values(pairs)
    .map((p) => ({
      pair: p.pair,
      currentHolding: p.currentHolding,
      avgCost: p.avgCost,
      totalRealizedGain: p.totalRealizedGain,
      gainCurrency: p.gainCurrency,
      tradeCount: tradeCounts.get(p.pair) ?? 0,
    }))
    .sort((a, b) => Math.abs(b.totalRealizedGain) - Math.abs(a.totalRealizedGain));

  return { pairs, summary };
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export interface AnalyticsTxRow {
  id: string;
  timestamp: Date;
  transactionType: string | null;
  type: string;
  location: string | null;
  incomeAmount: string | null;
  incomeCurrency: string | null;
  outcomeAmount: string | null;
  outcomeCurrency: string | null;
  clientId: string | null;
  clientName: string | null;
}

export interface PeriodBucket {
  period: string;
  label: string;
  /** Net currency flow from Exchange transactions (fiat received - fiat paid) */
  exchangePnl: Record<string, number>;
  revenue: Record<string, number>;
  volume: Record<string, number>;
  tradeCount: number;
}

export function buildPeriodBuckets(
  rows: AnalyticsTxRow[],
  bucket: "day" | "week" | "month" = "month"
): PeriodBucket[] {
  const map = new Map<string, PeriodBucket>();

  function getPeriod(d: Date): { period: string; label: string } {
    if (bucket === "day") {
      const p = d.toISOString().slice(0, 10);
      return { period: p, label: p };
    }
    if (bucket === "week") {
      const monday = new Date(d);
      const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
      // FIX: Sunday (day=0) needs -6, Monday (day=1) needs 0, etc.
      const diff = day === 0 ? -6 : 1 - day;
      monday.setDate(d.getDate() + diff);
      const p = monday.toISOString().slice(0, 10);
      return { period: p, label: `W ${p}` };
    }
    const p = d.toISOString().slice(0, 7);
    return { period: p, label: p };
  }

  for (const row of rows) {
    const txType = (row.transactionType ?? "").trim();
    if (txType !== "Exchange" && txType !== "Revenue") continue;

    const { period, label } = getPeriod(row.timestamp);
    if (!map.has(period)) {
      map.set(period, { period, label, exchangePnl: {}, revenue: {}, volume: {}, tradeCount: 0 });
    }
    const b = map.get(period)!;

    const incAmt = parseFloat(row.incomeAmount ?? "0") || 0;
    const outAmt = parseFloat(row.outcomeAmount ?? "0") || 0;
    const incCur = (row.incomeCurrency ?? "").trim();
    const outCur = (row.outcomeCurrency ?? "").trim();

    if (txType === "Exchange") {
      // Net flow per currency: +income, -outcome
      if (incCur) b.exchangePnl[incCur] = (b.exchangePnl[incCur] ?? 0) + incAmt;
      if (outCur) b.exchangePnl[outCur] = (b.exchangePnl[outCur] ?? 0) - outAmt;
      if (incCur) b.volume[incCur] = (b.volume[incCur] ?? 0) + incAmt;
      if (outCur) b.volume[outCur] = (b.volume[outCur] ?? 0) + outAmt;
      b.tradeCount++;
    } else if (txType === "Revenue") {
      if (incCur) b.revenue[incCur] = (b.revenue[incCur] ?? 0) + incAmt;
    }
  }

  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

export interface SpreadRow {
  pair: string;
  baseCurrency: string;
  quoteCurrency: string;
  buyCount: number;
  sellCount: number;
  avgBuy: number | null;
  avgSell: number | null;
  spread: number | null;
  marginPct: number | null;
  totalVolume: number;
}

export function buildSpreadAnalysis(
  rows: AnalyticsTxRow[],
  fiatCurrencies?: Set<string>
): SpreadRow[] {
  const fiatSet = fiatCurrencies ?? DEFAULT_FIAT;
  const pairs = new Map<string, {
    buyVolume: number; buyFiatVolume: number;
    sellVolume: number; sellFiatVolume: number;
    buyCount: number; sellCount: number;
  }>();

  for (const row of rows) {
    if ((row.transactionType ?? "").trim() !== "Exchange") continue;
    const incCur = (row.incomeCurrency ?? "").trim();
    const outCur = (row.outcomeCurrency ?? "").trim();
    const incAmt = parseFloat(row.incomeAmount ?? "0") || 0;
    const outAmt = parseFloat(row.outcomeAmount ?? "0") || 0;
    if (!incCur || !outCur || incAmt <= 0 || outAmt <= 0) continue;

    const incFiat = fiatSet.has(incCur);
    const outFiat = fiatSet.has(outCur);

    if (outFiat && !incFiat) {
      // BUY: received crypto, paid fiat
      const pair = `${incCur}/${outCur}`;
      if (!pairs.has(pair)) pairs.set(pair, { buyVolume: 0, buyFiatVolume: 0, sellVolume: 0, sellFiatVolume: 0, buyCount: 0, sellCount: 0 });
      const p = pairs.get(pair)!;
      p.buyVolume += incAmt;
      p.buyFiatVolume += outAmt;
      p.buyCount++;
    } else if (incFiat && !outFiat) {
      // SELL: gave crypto, received fiat
      const pair = `${outCur}/${incCur}`;
      if (!pairs.has(pair)) pairs.set(pair, { buyVolume: 0, buyFiatVolume: 0, sellVolume: 0, sellFiatVolume: 0, buyCount: 0, sellCount: 0 });
      const p = pairs.get(pair)!;
      p.sellVolume += outAmt;
      p.sellFiatVolume += incAmt;
      p.sellCount++;
    }
  }

  return [...pairs.entries()].map(([pair, d]) => {
    const [base, quote] = pair.split("/");
    const avgBuy  = d.buyVolume  > 0 ? d.buyFiatVolume  / d.buyVolume  : null;
    const avgSell = d.sellVolume > 0 ? d.sellFiatVolume / d.sellVolume : null;
    const spread  = avgBuy != null && avgSell != null ? avgSell - avgBuy : null;
    const marginPct = spread != null && avgBuy ? (spread / avgBuy) * 100 : null;
    return {
      pair, baseCurrency: base, quoteCurrency: quote,
      buyCount: d.buyCount, sellCount: d.sellCount,
      avgBuy, avgSell, spread, marginPct,
      totalVolume: d.buyVolume + d.sellVolume,
    };
  }).sort((a, b) => b.totalVolume - a.totalVolume);
}
