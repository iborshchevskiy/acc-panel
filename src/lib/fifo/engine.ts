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
  // Trade count: dedupe by user-tx ID so a single multi-leg tx that produces
  // several FifoTxRows on the same pair counts as ONE trade, not N. Each row
  // adds its row.id to the pair's set; the final count is set.size.
  const tradeTxIds = new Map<string, Set<string>>();
  const trackTrade = (pair: string, txId: string) => {
    const set = tradeTxIds.get(pair);
    if (set) set.add(txId);
    else tradeTxIds.set(pair, new Set([txId]));
  };

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
      trackTrade(pair, row.id);

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
      trackTrade(pair, row.id);

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
          trackTrade(inPair, row.id);
        }

        disposed.set(outPairKey, (disposed.get(outPairKey) ?? 0) + fiatConsumed);
        trackTrade(outPairKey, row.id);
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
        trackTrade(shortPair, row.id);
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
      tradeCount: tradeTxIds.get(p.pair)?.size ?? 0,
    }))
    .sort((a, b) => Math.abs(b.totalRealizedGain) - Math.abs(a.totalRealizedGain));

  return { pairs, summary };
}

// ── Leg → FifoTxRow expansion ─────────────────────────────────────────────────
// A multi-leg Exchange transaction can have:
//   • Several legs in the same currency on the same direction (split into chunks).
//   • The same currency on BOTH directions (e.g. CZK in 100k + CZK out 1.1k —
//     net inflow 98.8k CZK).
//   • Multiple distinct currencies on one or both directions, where the user
//     pays USDT once but receives EUR + CZK (or vice versa).
//
// The hard problem is splitting USDT (or any single-currency side) across
// multiple recipient currencies *deterministically* and *correctly*. Old
// algorithms either evenly split it (gave nonsense rates for unequal-value
// fiats) or relied on `created_at` order (broke when legs share a timestamp,
// which production has — see audit Bug #2/#3).
//
// New algorithm:
//   1. NET same-currency-cross-direction. If CZK appears as +100,000 in and
//      −1,162 out, the row is collapsed to +98,838 CZK in. This single change
//      recovers production tx 48d6c6d6 (audit Bug #1) where 98.8k CZK was
//      silently dropped.
//   2. Build org-wide RATE PRIORS from unambiguous (1×1 after netting) txs.
//      For each (inCur, outCur), the prior is the median outAmt/inAmt across
//      all clean txs. This gives us the org's typical EUR/USDT, CZK/USDT,
//      etc. rates as a deterministic reference.
//   3. For multi-currency splits (1×N or N×1 after netting), allocate the
//      single-side amount across the multi side proportionally to each
//      counterparty's USDT-equivalent value (via priors). This is what a
//      financial analyst would do by hand: weight by economic value, not by
//      raw counts. Falls back to even-split if priors are unavailable.
//   4. For 2×2 (rare in production — typically 4-leg txs collapse to 1×N
//      after netting), pick the pairing that minimises Σ(log(implied/prior))²
//      against the priors. Deterministic regardless of insert timestamp.
//
// `createdAt` is no longer load-bearing: the algorithm produces the same
// answer whether legs share a timestamp or not.

interface LegLike {
  direction: string;
  amount: string | null;
  currency: string | null;
  createdAt?: Date | string | null;
}

function netSides<T extends LegLike>(legs: T[]): {
  ins: Array<[string, number]>;
  outs: Array<[string, number]>;
} {
  // Sum signed amounts per currency: in = positive, out = negative.
  const net = new Map<string, number>();
  for (const l of legs) {
    if (!l.currency || !l.amount) continue;
    if (l.direction !== "in" && l.direction !== "out") continue;
    const amt = parseFloat(l.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    net.set(l.currency, (net.get(l.currency) ?? 0) + (l.direction === "in" ? amt : -amt));
  }
  const ins: Array<[string, number]> = [];
  const outs: Array<[string, number]> = [];
  for (const [cur, amount] of net) {
    if (amount > 1e-9) ins.push([cur, amount]);
    else if (amount < -1e-9) outs.push([cur, -amount]);
  }
  return { ins, outs };
}

function buildRatePriors<T extends LegLike>(
  txRows: Array<{ id: string; transactionType: string | null }>,
  legsByTx: Map<string, T[]>
): Map<string, number> {
  // Sample rates from unambiguous (1×1 after netting) Exchange txs. For each
  // sample we record BOTH directions: an EUR→USDT trade at 1.17 USDT/EUR also
  // seeds the inverse USDT→EUR prior at 0.855 EUR/USDT. This lets the splitter
  // work for both buys (USDT→fiat) and sells (fiat→USDT) without requiring
  // separate prior trades in each direction.
  const samples = new Map<string, number[]>();
  const push = (key: string, rate: number) => {
    if (!samples.has(key)) samples.set(key, []);
    samples.get(key)!.push(rate);
  };
  for (const tx of txRows) {
    if ((tx.transactionType ?? "").trim() !== "Exchange") continue;
    const { ins, outs } = netSides(legsByTx.get(tx.id) ?? []);
    if (ins.length !== 1 || outs.length !== 1) continue;
    if (ins[0][0] === outs[0][0]) continue;
    const [inCur, inAmt] = ins[0];
    const [outCur, outAmt] = outs[0];
    if (inAmt <= 0 || outAmt <= 0) continue;
    push(`${inCur}|${outCur}`, outAmt / inAmt);
    push(`${outCur}|${inCur}`, inAmt / outAmt);
  }
  const priors = new Map<string, number>();
  for (const [k, v] of samples) {
    v.sort((a, b) => a - b);
    priors.set(k, v[Math.floor(v.length / 2)]);
  }
  return priors;
}

export function legsToFifoRows<T extends LegLike>(
  txRows: Array<{ id: string; timestamp: Date | string; transactionType: string | null }>,
  legsByTx: Map<string, T[]>
): FifoTxRow[] {
  const priors = buildRatePriors(txRows, legsByTx);

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

    const { ins, outs } = netSides(txLegs);
    if (ins.length === 0 || outs.length === 0) return [];

    // 1×1 after netting — trivial.
    if (ins.length === 1 && outs.length === 1) {
      return [makeRow(ins[0][0], ins[0][1], outs[0][0], outs[0][1])];
    }

    // Many ins, single out — split outAmt across ins proportionally to
    // USDT-equivalent value of each in (via priors). E.g. 1130ed04 with
    // 23,839 USDT paid for 15,450 EUR + 122,000 CZK splits ~75/25 USDT
    // (matches the on-chain leg amounts), not 50/50.
    if (outs.length === 1) {
      const [outCur, outAmt] = outs[0];
      const weights = ins.map(([cur, amt]) => {
        const prior = priors.get(`${cur}|${outCur}`);
        return prior != null && prior > 0 ? amt * prior : null;
      });
      if (weights.every((w) => w != null)) {
        const total = (weights as number[]).reduce((a, b) => a + b, 0);
        if (total > 1e-9) {
          return ins.map(([cur, amt], i) => makeRow(cur, amt, outCur, ((weights[i] as number) / total) * outAmt));
        }
      }
      // Fallback: even split (legacy behaviour for orgs without priors).
      const share = outAmt / ins.length;
      return ins.map(([cur, amt]) => makeRow(cur, amt, outCur, share));
    }

    // Single in, many outs — symmetric.
    if (ins.length === 1) {
      const [inCur, inAmt] = ins[0];
      const weights = outs.map(([cur, amt]) => {
        const prior = priors.get(`${inCur}|${cur}`);
        return prior != null && prior > 0 ? amt / prior : null;
      });
      if (weights.every((w) => w != null)) {
        const total = (weights as number[]).reduce((a, b) => a + b, 0);
        if (total > 1e-9) {
          return outs.map(([cur, amt], i) => makeRow(inCur, ((weights[i] as number) / total) * inAmt, cur, amt));
        }
      }
      const share = inAmt / outs.length;
      return outs.map(([cur, amt]) => makeRow(inCur, share, cur, amt));
    }

    // 2×2 — try both pairings, pick min log-rate-deviation.
    if (ins.length === 2 && outs.length === 2) {
      const candidates = [
        [[ins[0], outs[0]], [ins[1], outs[1]]] as const,
        [[ins[0], outs[1]], [ins[1], outs[0]]] as const,
      ];
      let bestScore = Infinity;
      let bestCand = candidates[0];
      let anyHasPrior = false;
      for (const cand of candidates) {
        let score = 0;
        let priorCount = 0;
        for (const [[inCur, inAmt], [outCur, outAmt]] of cand) {
          const prior = priors.get(`${inCur}|${outCur}`);
          if (prior == null || prior <= 0) {
            score += 100; // strong penalty for missing prior
            continue;
          }
          priorCount++;
          const implied = outAmt / inAmt;
          const dev = Math.log(implied / prior);
          score += dev * dev;
        }
        if (priorCount > 0) anyHasPrior = true;
        if (score < bestScore) { bestScore = score; bestCand = cand; }
      }
      if (anyHasPrior) {
        return bestCand.map(([[inCur, inAmt], [outCur, outAmt]]) =>
          makeRow(inCur, inAmt, outCur, outAmt));
      }
    }

    // Larger N×M — pair by index (legacy "both multi" branch). Still rare in
    // production; if/when this fires we'll add a smarter heuristic.
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
