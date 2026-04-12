/**
 * FIFO cost basis engine — ports v1 get_fifo_positions() exactly.
 * Operates on raw transaction rows, returns structured results.
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
  costRate: number; // fiat per crypto
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

const FIAT_CURRENCIES = new Set(["EUR", "USD", "CZK", "PLN", "GBP", "UAH", "RUB"]);

export function runFifo(rows: FifoTxRow[], fiatCurrencies?: Set<string>): FifoResult {
  const fiatSet = fiatCurrencies ?? FIAT_CURRENCIES;
  const sorted = [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // pair → queue of lots (mutable tuples [remaining, costRate, date, txId])
  const queues = new Map<string, Array<[number, number, Date, string]>>();
  const realized = new Map<string, Disposal[]>();
  const acquired = new Map<string, number>();
  const disposed = new Map<string, number>();
  const tradeCounts = new Map<string, number>();

  for (const row of sorted) {
    if ((row.transactionType ?? "").trim() !== "Exchange") continue;
    const incCur = (row.incomeCurrency ?? "").trim();
    const outCur = (row.outcomeCurrency ?? "").trim();
    const incAmt = parseFloat(row.incomeAmount ?? "0") || 0;
    const outAmt = parseFloat(row.outcomeAmount ?? "0") || 0;
    if (!incCur || !outCur || incAmt <= 0 || outAmt <= 0) continue;

    const incFiat = fiatSet.has(incCur);
    const outFiat = fiatSet.has(outCur);

    if (incFiat && !outFiat) {
      // SOLD crypto — income=fiat, outcome=crypto
      const crypto = outCur, fiat = incCur;
      const pair = `${crypto}/${fiat}`;
      const proceedsRate = incAmt / outAmt;

      if (!queues.has(pair)) queues.set(pair, []);
      if (!realized.has(pair)) realized.set(pair, []);
      disposed.set(pair, (disposed.get(pair) ?? 0) + outAmt);
      tradeCounts.set(pair, (tradeCounts.get(pair) ?? 0) + 1);

      let toDispose = outAmt;
      const queue = queues.get(pair)!;

      while (toDispose > 1e-9 && queue.length > 0) {
        const lot = queue[0];
        const consumed = Math.min(lot[0], toDispose);
        realized.get(pair)!.push({
          txId: row.id,
          disposedAt: row.timestamp,
          amount: consumed,
          proceedsRate,
          costRate: lot[1],
          gain: (proceedsRate - lot[1]) * consumed,
          gainCurrency: fiat,
          lotAcquiredAt: lot[2],
        });
        lot[0] -= consumed;
        toDispose -= consumed;
        if (lot[0] <= 1e-9) queue.shift();
      }
      if (toDispose > 1e-9) {
        realized.get(pair)!.push({
          txId: row.id,
          disposedAt: row.timestamp,
          amount: toDispose,
          proceedsRate,
          costRate: 0,
          gain: proceedsRate * toDispose,
          gainCurrency: fiat,
          lotAcquiredAt: null,
        });
      }
    } else if (outFiat && !incFiat) {
      // BOUGHT crypto — outcome=fiat, income=crypto
      const crypto = incCur, fiat = outCur;
      const pair = `${crypto}/${fiat}`;
      const costRate = outAmt / incAmt;

      if (!queues.has(pair)) queues.set(pair, []);
      queues.get(pair)!.push([incAmt, costRate, row.timestamp, row.id]);
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

    const lots: TaxLot[] = queue.map((q) => ({
      txId: q[3],
      acquiredAt: q[2],
      originalAmount: acquired.get(pair) ?? q[0],
      remainingAmount: q[0],
      costRate: q[1],
    }));

    const currentHolding = queue.reduce((s, q) => s + q[0], 0);
    const totalRealizedGain = realizedList.reduce((s, d) => s + d.gain, 0);

    // Weighted avg cost from open lots
    const totalLotValue = queue.reduce((s, q) => s + q[0] * q[1], 0);
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
  exchangePnl: Record<string, number>;
  revenue: Record<string, number>;
  volume: Record<string, number>;
  tradeCount: number;
}

export function buildPeriodBuckets(rows: AnalyticsTxRow[], bucket: "day" | "week" | "month" = "month"): PeriodBucket[] {
  const map = new Map<string, PeriodBucket>();

  function getPeriod(d: Date): { period: string; label: string } {
    if (bucket === "day") {
      const p = d.toISOString().slice(0, 10);
      return { period: p, label: p };
    }
    if (bucket === "week") {
      const monday = new Date(d);
      monday.setDate(d.getDate() - d.getDay() + 1);
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

export function buildSpreadAnalysis(rows: AnalyticsTxRow[], fiatCurrencies?: Set<string>): SpreadRow[] {
  const fiatSet = fiatCurrencies ?? FIAT_CURRENCIES;
  const pairs = new Map<string, { buyVolume: number; buyFiatVolume: number; sellVolume: number; sellFiatVolume: number; buyCount: number; sellCount: number }>();

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
      // BUY: got crypto, paid fiat
      const pair = `${incCur}/${outCur}`;
      if (!pairs.has(pair)) pairs.set(pair, { buyVolume: 0, buyFiatVolume: 0, sellVolume: 0, sellFiatVolume: 0, buyCount: 0, sellCount: 0 });
      const p = pairs.get(pair)!;
      p.buyVolume += incAmt;
      p.buyFiatVolume += outAmt;
      p.buyCount++;
    } else if (incFiat && !outFiat) {
      // SELL: gave crypto, got fiat
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
    const avgBuy = d.buyVolume > 0 ? d.buyFiatVolume / d.buyVolume : null;
    const avgSell = d.sellVolume > 0 ? d.sellFiatVolume / d.sellVolume : null;
    const spread = avgBuy != null && avgSell != null ? avgSell - avgBuy : null;
    const marginPct = spread != null && avgBuy ? (spread / avgBuy) * 100 : null;
    return {
      pair,
      baseCurrency: base,
      quoteCurrency: quote,
      buyCount: d.buyCount,
      sellCount: d.sellCount,
      avgBuy,
      avgSell,
      spread,
      marginPct,
      totalVolume: d.buyVolume + d.sellVolume,
    };
  }).sort((a, b) => b.totalVolume - a.totalVolume);
}
