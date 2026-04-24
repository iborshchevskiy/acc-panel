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
  /** The fiat currency being traded (EUR, CZK…) — the asset tracked by FIFO */
  assetCurrency: string;
  /** The base/pricing currency (USDT) — gain is expressed in this */
  baseCurrency: string;
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
  // pair → short positions: sells with no matching lots yet, waiting for a subsequent buy
  // [remaining, proceedsRate, disposedAt, txId]
  const shortQueues = new Map<string, Array<[number, number, Date, string]>>();
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
      // BOUGHT fiat → exchange received fiat (EUR/CZK), paid base (USDT)
      // Asset tracked: fiat (incCur). Pricing: base (outCur).
      const pair = `${incCur}/${outCur}`;           // e.g. EUR/USDT
      const costRate = outAmt / incAmt;             // base per fiat unit (USDT/EUR)
      let toAcquire = incAmt;                       // fiat acquired

      if (!queues.has(pair)) queues.set(pair, []);
      if (!realized.has(pair)) realized.set(pair, []);
      acquired.set(pair, (acquired.get(pair) ?? 0) + incAmt);
      tradeCounts.set(pair, (tradeCounts.get(pair) ?? 0) + 1);

      // Close outstanding short positions first.
      // Gain = (sell rate − buy rate) × fiat amount, in base currency.
      if (shortQueues.has(pair)) {
        const shorts = shortQueues.get(pair)!;
        while (toAcquire > 1e-9 && shorts.length > 0) {
          const short = shorts[0];
          const consumed = Math.min(short[0], toAcquire);
          realized.get(pair)!.push({
            txId: short[3],
            disposedAt: short[2],
            amount: consumed,
            proceedsRate: short[1],
            costRate,
            gain: (short[1] - costRate) * consumed,
            gainCurrency: outCur,               // base currency (USDT)
            lotAcquiredAt: row.timestamp,
          });
          short[0] -= consumed;
          toAcquire -= consumed;
          if (short[0] <= 1e-9) shorts.shift();
        }
      }

      if (toAcquire > 1e-9) {
        queues.get(pair)!.push([toAcquire, costRate, row.timestamp, row.id, toAcquire]);
      }
    } else if (!incFiat && outFiat) {
      // SOLD fiat → exchange gave fiat (EUR/CZK), received base (USDT)
      // Dispose fiat lots acquired earlier.
      const pair = `${outCur}/${incCur}`;           // e.g. EUR/USDT
      const proceedsRate = incAmt / outAmt;         // base per fiat unit (USDT/EUR)

      if (!queues.has(pair)) queues.set(pair, []);
      if (!realized.has(pair)) realized.set(pair, []);
      disposed.set(pair, (disposed.get(pair) ?? 0) + outAmt);
      tradeCounts.set(pair, (tradeCounts.get(pair) ?? 0) + 1);

      let toDispose = outAmt;                       // fiat being disposed
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
          gainCurrency: incCur,                   // base currency (USDT)
          lotAcquiredAt: lot[D],
        });
        lot[R] -= consumed;
        toDispose -= consumed;
        if (lot[R] <= 1e-9) queue.shift();
      }

      // No lots — record as short (sold fiat before sourcing it).
      if (toDispose > 1e-9) {
        if (!shortQueues.has(pair)) shortQueues.set(pair, []);
        shortQueues.get(pair)!.push([toDispose, proceedsRate, row.timestamp, row.id]);
      }
    } else if (incFiat && outFiat) {
      // Fiat/fiat swap (e.g. USD → CZK, or EUR → CZK).
      // The outgoing fiat may have been purchased with USDT and have open lots.
      // Close those lots and carry the USDT cost basis forward to the incoming fiat
      // so gain is recognised when the incoming fiat is eventually sold for USDT.
      // No gain is recorded at the swap itself — only a basis transfer.

      // Find if the outgoing fiat has lots from a known base currency.
      const outPairKey = [...queues.keys()].find(
        (k) => k.startsWith(`${outCur}/`) && (queues.get(k)?.some((q) => q[R] > 1e-9))
      );
      if (outPairKey) {
        const baseCur = outPairKey.split("/")[1]; // e.g. USDT
        const inPair  = `${incCur}/${baseCur}`;  // e.g. CZK/USDT
        const outQueue = queues.get(outPairKey)!;

        let toDispose = outAmt;
        let basisCarried = 0; // USDT basis consumed from outgoing lots
        let fiatConsumed = 0;

        while (toDispose > 1e-9 && outQueue.length > 0) {
          const lot = outQueue[0];
          const consumed = Math.min(lot[R], toDispose);
          basisCarried += consumed * lot[C];
          fiatConsumed  += consumed;
          lot[R] -= consumed;
          toDispose -= consumed;
          if (lot[R] <= 1e-9) outQueue.shift();
        }

        if (fiatConsumed > 1e-9 && basisCarried > 1e-9) {
          // Proportional share of incoming fiat that has a backing cost basis.
          const proportion = fiatConsumed / outAmt;
          const inAmt = incAmt * proportion;
          const inheritedRate = basisCarried / inAmt; // base per incoming fiat unit

          if (!queues.has(inPair)) queues.set(inPair, []);
          if (!realized.has(inPair)) realized.set(inPair, []);
          queues.get(inPair)!.push([inAmt, inheritedRate, row.timestamp, row.id, inAmt]);
          acquired.set(inPair, (acquired.get(inPair) ?? 0) + inAmt);
          tradeCounts.set(inPair, (tradeCounts.get(inPair) ?? 0) + 1);
        }

        disposed.set(outPairKey, (disposed.get(outPairKey) ?? 0) + fiatConsumed);
        tradeCounts.set(outPairKey, (tradeCounts.get(outPairKey) ?? 0) + 1);
      }
    }
  }

  const pairs: Record<string, PairResult> = {};
  const allPairs = new Set([...queues.keys(), ...realized.keys(), ...shortQueues.keys()]);

  for (const pair of allPairs) {
    const [asset, base] = pair.split("/"); // e.g. EUR / USDT
    const queue = queues.get(pair) ?? [];
    const shorts = shortQueues.get(pair) ?? [];
    const realizedList = realized.get(pair) ?? [];

    const lots: TaxLot[] = queue.map((q) => ({
      txId: q[T],
      acquiredAt: q[D],
      originalAmount: q[O],
      remainingAmount: q[R],
      costRate: q[C],
    }));

    const lotHolding = queue.reduce((s, q) => s + q[R], 0);
    const shortPosition = shorts.reduce((s, sh) => s + sh[0], 0);
    const currentHolding = lotHolding - shortPosition;

    const totalRealizedGain = realizedList.reduce((s, d) => s + d.gain, 0);
    const totalLotValue = queue.reduce((s, q) => s + q[R] * q[C], 0);
    const avgCost = lotHolding > 1e-9 ? totalLotValue / lotHolding : null;

    pairs[pair] = {
      pair,
      assetCurrency: asset,   // fiat being traded (EUR, CZK…)
      baseCurrency: base,     // pricing/base currency (USDT)
      lots,
      disposals: realizedList,
      totalAcquired: acquired.get(pair) ?? 0,
      totalDisposed: disposed.get(pair) ?? 0,
      currentHolding,
      avgCost,
      totalRealizedGain,
      gainCurrency: base,     // gain is in base (USDT)
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

// ── Leg → FifoTxRow expansion ─────────────────────────────────────────────────
// Handles multi-leg transactions correctly by collapsing same-currency legs
// (sum amounts) and generating one FifoTxRow per (in-currency × out-currency)
// pair, splitting the "other side" proportionally by count when there are
// multiple currencies on one side.

interface LegLike {
  direction: string;
  amount: string | null;
  currency: string | null;
}

export function legsToFifoRows<T extends LegLike>(
  txRows: Array<{ id: string; timestamp: Date | string; transactionType: string | null }>,
  legsByTx: Map<string, T[]>
): FifoTxRow[] {
  return txRows.flatMap((tx) => {
    const txLegs = legsByTx.get(tx.id) ?? [];

    // Collapse same-currency legs by summing amounts per direction
    const inByCur = new Map<string, number>();
    const outByCur = new Map<string, number>();
    for (const l of txLegs) {
      if (!l.currency || !l.amount) continue;
      if (l.direction === "in") {
        inByCur.set(l.currency, (inByCur.get(l.currency) ?? 0) + parseFloat(l.amount));
      } else if (l.direction === "out") {
        outByCur.set(l.currency, (outByCur.get(l.currency) ?? 0) + parseFloat(l.amount));
      }
    }

    const ins = [...inByCur.entries()];
    const outs = [...outByCur.entries()];
    if (ins.length === 0 || outs.length === 0) return [];

    const ts = tx.timestamp instanceof Date ? tx.timestamp : new Date(tx.timestamp as string);

    const makeRow = (inCur: string, inAmt: number, outCur: string, outAmt: number): FifoTxRow => ({
      id: tx.id,
      timestamp: ts,
      transactionType: tx.transactionType,
      incomeAmount: inAmt.toString(),
      incomeCurrency: inCur,
      outcomeAmount: outAmt.toString(),
      outcomeCurrency: outCur,
    });

    // Normal case: one in-currency, one out-currency
    if (ins.length === 1 && outs.length === 1) {
      return [makeRow(ins[0][0], ins[0][1], outs[0][0], outs[0][1])];
    }

    // Multiple in-currencies, single out-currency:
    // split the out amount evenly among in-currencies so total spend is preserved
    if (outs.length === 1) {
      const share = outs[0][1] / ins.length;
      return ins.map(([cur, amt]) => makeRow(cur, amt, outs[0][0], share));
    }

    // Single in-currency, multiple out-currencies:
    // split the in amount evenly among out-currencies
    if (ins.length === 1) {
      const share = ins[0][1] / outs.length;
      return outs.map(([cur, amt]) => makeRow(ins[0][0], share, cur, amt));
    }

    // Both sides have multiple currencies: pair by position (zip)
    const rows: FifoTxRow[] = [];
    for (let i = 0; i < Math.max(ins.length, outs.length); i++) {
      const [inCur, inAmt] = ins[i % ins.length];
      const [outCur, outAmt] = outs[i % outs.length];
      rows.push(makeRow(inCur, inAmt, outCur, outAmt));
    }
    return rows;
  });
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
