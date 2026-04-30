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
  txId: string;       // sell transaction ID
  lotTxId: string | null; // buy transaction ID that created the consumed lot
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
      // Shorts with proceedsRate=0 were created from fiat/fiat swaps with no
      // USDT leg — closing them produces no meaningful USDT gain, so skip
      // recording a disposal (just drain the short quantity).
      if (shortQueues.has(pair)) {
        const shorts = shortQueues.get(pair)!;
        while (toAcquire > 1e-9 && shorts.length > 0) {
          const short = shorts[0];
          const consumed = Math.min(short[0], toAcquire);
          if (short[1] > 1e-9) {
            realized.get(pair)!.push({
              txId: short[3],
              lotTxId: row.id,
              disposedAt: short[2],
              amount: consumed,
              proceedsRate: short[1],
              costRate,
              gain: (short[1] - costRate) * consumed,
              gainCurrency: outCur,
              lotAcquiredAt: row.timestamp,
            });
          }
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
          lotTxId: lot[T],
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
      // Fiat/fiat swap (e.g. USD → CZK, or RUB → CZK).
      // If the outgoing fiat has open lots (bought earlier with USDT), close them
      // and carry the USDT cost basis forward to the incoming fiat.
      // If there are NO lots (or lots are exhausted), record a short position so
      // that when the outgoing fiat is later acquired it closes cleanly —
      // preventing ghost open lots.

      let toDispose = outAmt;
      let basisCarried = 0;
      let fiatConsumed = 0;
      let baseCur = "USDT"; // default base; overridden by actual lot's base if found

      const outPairKey = [...queues.keys()].find(
        (k) => k.startsWith(`${outCur}/`) && (queues.get(k)?.some((q) => q[R] > 1e-9))
      );

      if (outPairKey) {
        baseCur = outPairKey.split("/")[1];
        const inPair  = `${incCur}/${baseCur}`;
        const outQueue = queues.get(outPairKey)!;

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
          const proportion = fiatConsumed / outAmt;
          const inheritedRate = basisCarried / (incAmt * proportion);

          if (!queues.has(inPair)) queues.set(inPair, []);
          if (!realized.has(inPair)) realized.set(inPair, []);

          // Before opening new lots for the incoming fiat, close any existing
          // shorts for it (e.g. the exchange previously gave this fiat before
          // sourcing it and recorded a short).
          // Shorts with proceedsRate=0 (fiat/fiat origin, no USDT leg) are
          // drained silently — no disposal recorded.
          let toAcquire = incAmt * proportion;
          if (shortQueues.has(inPair)) {
            const shorts = shortQueues.get(inPair)!;
            while (toAcquire > 1e-9 && shorts.length > 0) {
              const short = shorts[0];
              const consumed = Math.min(short[0], toAcquire);
              if (short[1] > 1e-9) {
                realized.get(inPair)!.push({
                  txId: short[3],
                  lotTxId: row.id,
                  disposedAt: short[2],
                  amount: consumed,
                  proceedsRate: short[1],
                  costRate: inheritedRate,
                  gain: (short[1] - inheritedRate) * consumed,
                  gainCurrency: baseCur,
                  lotAcquiredAt: row.timestamp,
                });
              }
              short[0] -= consumed;
              toAcquire -= consumed;
              if (short[0] <= 1e-9) shorts.shift();
            }
          }

          // Any remaining incoming fiat not used to close shorts becomes a new lot.
          if (toAcquire > 1e-9) {
            queues.get(inPair)!.push([toAcquire, inheritedRate, row.timestamp, row.id, toAcquire]);
          }
          acquired.set(inPair, (acquired.get(inPair) ?? 0) + incAmt * proportion);
          tradeCounts.set(inPair, (tradeCounts.get(inPair) ?? 0) + 1);
        }

        disposed.set(outPairKey, (disposed.get(outPairKey) ?? 0) + fiatConsumed);
        tradeCounts.set(outPairKey, (tradeCounts.get(outPairKey) ?? 0) + 1);
      }

      // Any outgoing fiat with no lot backing (full short or partial remainder):
      // record as short so future acquisitions of this fiat close it cleanly.
      // proceedsRate = 0 because we don't know the USDT rate for this swap leg;
      // the resulting gain when covered will reflect only the acquisition cost.
      if (toDispose > 1e-9) {
        const shortPair = `${outCur}/${baseCur}`;
        if (!shortQueues.has(shortPair)) shortQueues.set(shortPair, []);
        if (!queues.has(shortPair)) queues.set(shortPair, []);
        if (!realized.has(shortPair)) realized.set(shortPair, []);
        shortQueues.get(shortPair)!.push([toDispose, 0, row.timestamp, row.id]);
        disposed.set(shortPair, (disposed.get(shortPair) ?? 0) + toDispose);
        tradeCounts.set(shortPair, (tradeCounts.get(shortPair) ?? 0) + 1);
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
// Handles multi-leg transactions by first attempting greedy chronological
// pairing of opposite-direction legs (so e.g. "out USDT, in EUR, in CZK,
// out USDT" becomes two paired rows with correct per-leg cost basis instead
// of one collapsed row with an averaged-out rate). Falls back to the legacy
// collapse + even-split logic when the greedy pass leaves any leg unmatched.

interface LegLike {
  direction: string;
  amount: string | null;
  currency: string | null;
  /**
   * Optional — when present, legs are sorted by this before pairing.
   * Caller should query with ORDER BY created_at ASC, id ASC for stable results.
   */
  createdAt?: Date | string | null;
}

export function legsToFifoRows<T extends LegLike>(
  txRows: Array<{ id: string; timestamp: Date | string; transactionType: string | null }>,
  legsByTx: Map<string, T[]>
): FifoTxRow[] {
  return txRows.flatMap((tx) => {
    const txLegs = legsByTx.get(tx.id) ?? [];

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

    // ── Pass 1: greedy chronological pairing ────────────────────────────────
    // Walk valid in/out legs in order; whenever we see a direction-flip,
    // pair the new leg with the head of the opposite-direction queue.
    // If every leg pairs cleanly (no leftovers), use those pairs as the
    // canonical breakdown — it preserves per-leg rates faithfully.
    const orderedLegs = [...txLegs]
      .filter((l) => l.currency && l.amount && (l.direction === "in" || l.direction === "out"))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt as string | Date).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt as string | Date).getTime() : 0;
        return ta - tb;
      });

    if (orderedLegs.length === 0) return [];

    const pendingIn: T[] = [];
    const pendingOut: T[] = [];
    const pairs: Array<{ outCur: string; outAmt: number; inCur: string; inAmt: number }> = [];

    for (const leg of orderedLegs) {
      const cur = leg.currency!;
      const amt = parseFloat(leg.amount!);
      if (!Number.isFinite(amt) || amt <= 0) continue;

      if (leg.direction === "in") {
        const partner = pendingOut.shift();
        if (partner) {
          pairs.push({
            outCur: partner.currency!,
            outAmt: parseFloat(partner.amount!),
            inCur: cur,
            inAmt: amt,
          });
        } else {
          pendingIn.push(leg);
        }
      } else {
        const partner = pendingIn.shift();
        if (partner) {
          pairs.push({
            outCur: cur,
            outAmt: amt,
            inCur: partner.currency!,
            inAmt: parseFloat(partner.amount!),
          });
        } else {
          pendingOut.push(leg);
        }
      }
    }

    // Greedy succeeded if every leg got a partner. Reject the result when any
    // pair has the same currency on both sides (e.g. internal USDT shuffle) —
    // those produce spurious rows; fall back to legacy logic.
    if (pendingIn.length === 0 && pendingOut.length === 0 && pairs.length > 0) {
      const sameCurrencyPair = pairs.some((p) => p.inCur === p.outCur);
      if (!sameCurrencyPair) {
        // Merge pairs that share the same (inCur, outCur) — cleaner FIFO output
        // when several legs were paired with the same currency combo.
        const merged = new Map<string, { inCur: string; outCur: string; inAmt: number; outAmt: number }>();
        for (const p of pairs) {
          const key = `${p.inCur}|${p.outCur}`;
          const existing = merged.get(key);
          if (existing) {
            existing.inAmt += p.inAmt;
            existing.outAmt += p.outAmt;
          } else {
            merged.set(key, { inCur: p.inCur, outCur: p.outCur, inAmt: p.inAmt, outAmt: p.outAmt });
          }
        }
        return [...merged.values()].map((p) => makeRow(p.inCur, p.inAmt, p.outCur, p.outAmt));
      }
    }

    // ── Pass 2: legacy collapse + even-split fallback ──────────────────────
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

    if (ins.length === 1 && outs.length === 1) {
      return [makeRow(ins[0][0], ins[0][1], outs[0][0], outs[0][1])];
    }

    if (outs.length === 1) {
      const share = outs[0][1] / ins.length;
      return ins.map(([cur, amt]) => makeRow(cur, amt, outs[0][0], share));
    }

    if (ins.length === 1) {
      const share = ins[0][1] / outs.length;
      return outs.map(([cur, amt]) => makeRow(ins[0][0], share, cur, amt));
    }

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
