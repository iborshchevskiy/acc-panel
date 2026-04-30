import { describe, it, expect } from "vitest";
import { runFifo, legsToFifoRows, type FifoTxRow } from "./engine";

// In production: EUR/CZK/RUB are fiat, USDT is the pricing base (not fiat).
const FIAT = new Set(["EUR", "CZK"]);

function row(
  id: string,
  timestamp: string,
  incomeAmount: string | null,
  incomeCurrency: string | null,
  outcomeAmount: string | null,
  outcomeCurrency: string | null
): FifoTxRow {
  return {
    id,
    timestamp: new Date(timestamp),
    transactionType: "Exchange",
    incomeAmount,
    incomeCurrency,
    outcomeAmount,
    outcomeCurrency,
  };
}

describe("runFifo", () => {
  it("returns empty result for empty input", () => {
    const result = runFifo([], FIAT);
    expect(result.pairs).toEqual({});
    expect(result.summary).toEqual([]);
  });

  it("records a simple buy", () => {
    // Buy 1000 EUR @ 1.08 USDT/EUR
    const rows = [row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT")];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair).toBeDefined();
    expect(pair.totalAcquired).toBeCloseTo(1000);
    expect(pair.currentHolding).toBeCloseTo(1000);
    expect(pair.lots).toHaveLength(1);
    expect(pair.lots[0].costRate).toBeCloseTo(1.08);
    expect(pair.disposals).toHaveLength(0);
    expect(pair.totalRealizedGain).toBe(0);
  });

  it("records a simple sell and computes gain", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT"), // buy 1000 EUR @ 1.08
      row("t2", "2024-06-01", "1200", "USDT", "1000", "EUR"), // sell 1000 EUR @ 1.20 → +120 USDT
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].gain).toBeCloseTo(120); // (1.20 - 1.08) × 1000
    expect(pair.disposals[0].gainCurrency).toBe("USDT");
    expect(pair.totalRealizedGain).toBeCloseTo(120);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("correctly applies FIFO ordering across multiple lots", () => {
    const rows = [
      row("t1", "2024-01-01", "100", "EUR", "90", "USDT"),  // lot1: 100 EUR @ 0.90
      row("t2", "2024-02-01", "100", "EUR", "100", "USDT"), // lot2: 100 EUR @ 1.00
      row("t3", "2024-06-01", "110", "USDT", "100", "EUR"), // sell 100 EUR @ 1.10
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    // Should consume lot1 first (FIFO): gain = (1.10 - 0.90) × 100 = 20 USDT
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].costRate).toBeCloseTo(0.90);
    expect(pair.disposals[0].gain).toBeCloseTo(20);
    // lot2 should remain
    expect(pair.currentHolding).toBeCloseTo(100);
    expect(pair.lots).toHaveLength(1);
    expect(pair.lots[0].costRate).toBeCloseTo(1.00);
  });

  it("splits a lot correctly when selling partial", () => {
    const rows = [
      row("t1", "2024-01-01", "2000", "EUR", "2000", "USDT"), // 2000 EUR @ 1.00
      row("t2", "2024-06-01", "1500", "USDT", "1000", "EUR"), // sell 1000 EUR @ 1.50
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals[0].amount).toBeCloseTo(1000);
    expect(pair.disposals[0].gain).toBeCloseTo(500); // (1.50 - 1.00) × 1000
    expect(pair.currentHolding).toBeCloseTo(1000);
    expect(pair.lots[0].remainingAmount).toBeCloseTo(1000);
  });

  it("handles sell spanning multiple lots", () => {
    const rows = [
      row("t1", "2024-01-01", "100", "EUR", "100", "USDT"), // lot1: 100 EUR @ 1.00
      row("t2", "2024-02-01", "100", "EUR", "200", "USDT"), // lot2: 100 EUR @ 2.00
      row("t3", "2024-06-01", "600", "USDT", "200", "EUR"), // sell 200 EUR @ 3.00
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    // 2 disposals: one from each lot
    expect(pair.disposals).toHaveLength(2);
    const totalGain = pair.disposals.reduce((s, d) => s + d.gain, 0);
    // lot1: (3.00 - 1.00) × 100 = 200; lot2: (3.00 - 2.00) × 100 = 100; total = 300
    expect(totalGain).toBeCloseTo(300);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("selling fiat with no lots creates a short position (no immediate disposal)", () => {
    // Sell EUR before ever buying it — opens a short, not a disposal
    const rows = [row("t1", "2024-01-01", "1200", "USDT", "1000", "EUR")];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals).toHaveLength(0);
    // currentHolding is negative while the short is open
    expect(pair.currentHolding).toBeCloseTo(-1000);
  });

  it("short sell is closed with gain when fiat is subsequently bought", () => {
    const rows = [
      row("t1", "2024-01-01", "1200", "USDT", "1000", "EUR"), // short: sell EUR @ 1.20
      row("t2", "2024-06-01", "1000", "EUR", "900", "USDT"),  // close: buy EUR @ 0.90 → gain = (1.20-0.90)×1000 = 300
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.disposals).toHaveLength(1);
    expect(pair.disposals[0].proceedsRate).toBeCloseTo(1.20);
    expect(pair.disposals[0].costRate).toBeCloseTo(0.90);
    expect(pair.disposals[0].gain).toBeCloseTo(300);
    expect(pair.currentHolding).toBeCloseTo(0);
  });

  it("ignores non-Exchange transactions", () => {
    const rows = [
      {
        id: "t1",
        timestamp: new Date("2024-01-01"),
        transactionType: "Revenue",
        incomeAmount: "1000",
        incomeCurrency: "EUR",
        outcomeAmount: null,
        outcomeCurrency: null,
      },
    ];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("ignores crypto-to-crypto swaps (both legs non-fiat)", () => {
    const rows = [row("t1", "2024-01-01", "1000", "USDT", "0.5", "BTC")];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(0);
  });

  it("fiat-to-fiat swap with no prior lots creates a short but no disposals", () => {
    // EUR→CZK with no EUR lots: creates an EUR short (rate=0); no USDT gain recorded
    const rows = [row("t1", "2024-01-01", "50000", "CZK", "1000", "EUR")];
    const result = runFifo(rows, FIAT);
    // No disposals anywhere — the short is pure internal state
    const allDisposals = Object.values(result.pairs).flatMap((p) => p.disposals);
    expect(allDisposals).toHaveLength(0);
  });

  it("handles multiple currency pairs independently", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT"), // buy EUR
      row("t2", "2024-01-02", "50000", "CZK", "1000", "USDT"), // buy CZK
      row("t3", "2024-06-01", "1200", "USDT", "1000", "EUR"),  // sell EUR @ profit
    ];
    const result = runFifo(rows, FIAT);
    expect(Object.keys(result.pairs)).toHaveLength(2);
    expect(result.pairs["EUR/USDT"].totalRealizedGain).toBeCloseTo(120); // (1.20-1.08)×1000
    expect(result.pairs["CZK/USDT"].totalRealizedGain).toBe(0);
    expect(result.pairs["CZK/USDT"].currentHolding).toBeCloseTo(50000);
  });

  it("summary orders by absolute realized gain descending", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1000", "USDT"),   // EUR @ 1.00
      row("t2", "2024-01-01", "10000", "CZK", "1000", "USDT"),  // CZK @ 0.10
      row("t3", "2024-06-01", "1100", "USDT", "1000", "EUR"),   // sell EUR → +100
      row("t4", "2024-06-01", "2000", "USDT", "10000", "CZK"),  // sell CZK → +1000
    ];
    const result = runFifo(rows, FIAT);
    expect(result.summary[0].pair).toBe("CZK/USDT");
    expect(result.summary[1].pair).toBe("EUR/USDT");
  });

  it("avgCost reflects weighted average of remaining lots", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1000", "USDT"), // 1000 EUR @ 1.00
      row("t2", "2024-02-01", "3000", "EUR", "3000", "USDT"), // 3000 EUR @ 1.00
    ];
    const result = runFifo(rows, FIAT);
    const pair = result.pairs["EUR/USDT"];
    expect(pair.currentHolding).toBeCloseTo(4000);
    expect(pair.avgCost).toBeCloseTo(1.00);
  });

  it("avgCost is null when holding is zero", () => {
    const rows = [
      row("t1", "2024-01-01", "1000", "EUR", "1080", "USDT"),
      row("t2", "2024-06-01", "1200", "USDT", "1000", "EUR"),
    ];
    const result = runFifo(rows, FIAT);
    expect(result.pairs["EUR/USDT"].avgCost).toBeNull();
  });

  // Regression: fiat/fiat-origin shorts (proceedsRate=0) must not produce
  // a disposal entry when closed by a USDT buy — doing so yields a
  // spurious negative gain in USDT.
  it("closing a fiat/fiat-origin short via USDT buy produces no disposal", () => {
    const FIAT2 = new Set(["CZK", "RUB"]);
    const rows = [
      // TX1: sell CZK for RUB — no CZK lots exist, so a CZK short (rate=0) is created
      row("t1", "2024-01-01", "150000", "RUB", "50000", "CZK"),
      // TX2: buy CZK with USDT — closes the rate=0 short; must NOT emit a disposal
      row("t2", "2024-02-01", "50000", "CZK", "1000", "USDT"),
    ];
    const result = runFifo(rows, FIAT2);
    const pair = result.pairs["CZK/USDT"];
    expect(pair).toBeDefined();
    // No disposal: the short was rate=0 and must be drained silently
    expect(pair.disposals).toHaveLength(0);
    expect(pair.totalRealizedGain).toBe(0);
  });

  // Regression: same rule applies when a rate=0 short is closed by a
  // fiat/fiat swap (the incoming-currency short-draining path).
  it("closing a fiat/fiat-origin short via another fiat/fiat swap produces no disposal", () => {
    const FIAT3 = new Set(["CZK", "RUB", "EUR"]);
    const rows = [
      // TX1: sell EUR for CZK — no EUR lots exist, creates EUR short (rate=0) + CZK lots
      row("t1", "2024-01-01", "50000", "CZK", "1000", "EUR"),
      // TX2: sell RUB for EUR — no RUB lots exist, creates RUB short (rate=0).
      //   Before creating EUR lots it drains the EUR short (rate=0) silently.
      row("t2", "2024-02-01", "1000", "EUR", "90000", "RUB"),
    ];
    const result = runFifo(rows, FIAT3);
    // No meaningful USDT disposals anywhere
    const allDisposals = Object.values(result.pairs).flatMap((p) => p.disposals);
    expect(allDisposals).toHaveLength(0);
  });
});

// ── legsToFifoRows ───────────────────────────────────────────────────────────
// Greedy chronological pairing: when an Exchange has interleaved opposite-direction
// legs (e.g. "out USDT, in EUR, in CZK, out USDT"), the engine pairs each in-leg
// with the most recent unmatched out-leg (and vice-versa). This recovers the
// per-leg cost basis instead of averaging USDT across all received fiats.

interface TestLeg {
  direction: string;
  amount: string | null;
  currency: string | null;
  createdAt: string;
}

function leg(direction: "in" | "out", amount: string, currency: string, createdAt: string): TestLeg {
  return { direction, amount, currency, createdAt };
}

function txMeta(id: string, timestamp: string) {
  return { id, timestamp: new Date(timestamp), transactionType: "Exchange" };
}

describe("legsToFifoRows", () => {
  it("pairs a simple 2-leg exchange into one row", () => {
    const tx = txMeta("t1", "2026-01-01");
    const legs = new Map([
      ["t1", [
        leg("out", "1000", "USDT", "2026-01-01T10:00:00Z"),
        leg("in",  "900",  "EUR",  "2026-01-01T10:00:01Z"),
      ]],
    ]);
    const rows = legsToFifoRows([tx], legs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      incomeCurrency: "EUR", incomeAmount: "900",
      outcomeCurrency: "USDT", outcomeAmount: "1000",
    });
  });

  // Helper: a couple of unambiguous EUR/USDT and CZK/USDT trades that the
  // engine uses as priors when splitting multi-currency multi-leg txs.
  function priorTxs() {
    return {
      txs: [
        txMeta("p-eur-1", "2026-01-15T10:00:00Z"),
        txMeta("p-eur-2", "2026-02-10T10:00:00Z"),
        txMeta("p-czk-1", "2026-01-20T10:00:00Z"),
        txMeta("p-czk-2", "2026-02-12T10:00:00Z"),
      ],
      legs: new Map([
        ["p-eur-1", [
          leg("in",  "1000", "EUR",  "2026-01-15T10:00:00Z"),
          leg("out", "1170", "USDT", "2026-01-15T10:00:01Z"),
        ]],
        ["p-eur-2", [
          leg("in",  "2000", "EUR",  "2026-02-10T10:00:00Z"),
          leg("out", "2310", "USDT", "2026-02-10T10:00:01Z"),
        ]],
        ["p-czk-1", [
          leg("in",  "10000", "CZK",  "2026-01-20T10:00:00Z"),
          leg("out", "478",   "USDT", "2026-01-20T10:00:01Z"),
        ]],
        ["p-czk-2", [
          leg("in",  "50000", "CZK",  "2026-02-12T10:00:00Z"),
          leg("out", "2390",  "USDT", "2026-02-12T10:00:01Z"),
        ]],
      ]),
    };
  }

  it("regression: ilya 1130ed04 — 4-leg buy splits USDT by USDT-equivalent", () => {
    // Production tx: paid USDT separately for EUR and CZK. After netting (no
    // same-currency cross-direction here) we have 23,839 USDT out, 15,450 EUR
    // + 122,000 CZK in. With market priors (~1.155 USDT/EUR, ~0.0479 USDT/CZK)
    // the engine allocates ~17,845 USDT to EUR and ~5,994 USDT to CZK.
    // That gives EUR ~1.155 USDT/EUR and CZK ~20.36 CZK/USDT — both within
    // 1% of the actual on-chain leg rates (1.165 / 20.90).
    const prior = priorTxs();
    const tx = txMeta("buy", "2026-04-27T18:56:00Z");
    const legs = new Map([
      ...prior.legs,
      ["buy", [
        leg("out", "18002.242", "USDT", "2026-04-28T00:41:50Z"),
        leg("in",  "15450",     "EUR",  "2026-04-28T08:45:07Z"),
        leg("in",  "122000",    "CZK",  "2026-04-28T08:45:20Z"),
        leg("out", "5837.321",  "USDT", "2026-04-28T08:46:48Z"),
      ]],
    ]);
    const rows = legsToFifoRows([...prior.txs, tx], legs);
    const buyRows = rows.filter((r) => r.id === "buy");
    expect(buyRows).toHaveLength(2);

    const eurRow = buyRows.find((r) => r.incomeCurrency === "EUR")!;
    const czkRow = buyRows.find((r) => r.incomeCurrency === "CZK")!;
    // Sum preserved: net USDT total = 23,839.563
    const totalUsdt = parseFloat(eurRow.outcomeAmount!) + parseFloat(czkRow.outcomeAmount!);
    expect(totalUsdt).toBeCloseTo(23839.563, 2);
    // EUR share dominates because EUR has a much higher USDT-equiv rate.
    // Each side's allocation is proportional to amount × prior, so EUR gets
    // ~75% of the total USDT.
    const eurUsdt = parseFloat(eurRow.outcomeAmount!);
    expect(eurUsdt / totalUsdt).toBeGreaterThan(0.7);
    // CZK rate ends up close to the on-market 21 CZK/USDT (not the pre-fix 10.235).
    const czkPerUsdt = parseFloat(czkRow.incomeAmount!) / parseFloat(czkRow.outcomeAmount!);
    expect(czkPerUsdt).toBeGreaterThan(15);
    expect(czkPerUsdt).toBeLessThan(25);
  });

  it("regression: production tx 48d6c6d6 (audit Bug #1) — same-currency cross-direction is netted", () => {
    // Real production tx: 4 legs with CZK on BOTH directions.
    //   in   1,000   EUR
    //   out  4,773   USDT
    //   out  1,162   CZK
    //   in 100,000   CZK
    // Net inflow: +1000 EUR, +98,838 CZK, -4,773 USDT.
    // Pre-fix, the engine produced a (CZK,CZK) ghost row that runFifo
    // self-cancelled, silently dropping 98,838 CZK from cost-basis tracking.
    // After netting same-currency cross-direction, we have 1×N (1 USDT-out
    // vs 2 fiat-ins) and the engine splits via priors.
    const prior = priorTxs();
    const tx = txMeta("48d6c6d6", "2026-03-15T11:35:08Z");
    const legs = new Map([
      ...prior.legs,
      ["48d6c6d6", [
        leg("in",  "1000",    "EUR",  "2026-03-15T11:35:08Z"),
        leg("out", "4773",    "USDT", "2026-03-15T11:35:08Z"),
        leg("out", "1162",    "CZK",  "2026-03-15T11:35:08Z"),
        leg("in",  "100000",  "CZK",  "2026-03-15T11:35:08Z"),
      ]],
    ]);
    const rows = legsToFifoRows([...prior.txs, tx], legs);
    const tgt = rows.filter((r) => r.id === "48d6c6d6");
    expect(tgt).toHaveLength(2);
    const eurRow = tgt.find((r) => r.incomeCurrency === "EUR")!;
    const czkRow = tgt.find((r) => r.incomeCurrency === "CZK")!;
    // CZK is netted to 98,838 — *not* dropped.
    expect(parseFloat(czkRow.incomeAmount!)).toBeCloseTo(98838, 1);
    // Total USDT preserved: 4,773.
    const totalUsdt = parseFloat(eurRow.outcomeAmount!) + parseFloat(czkRow.outcomeAmount!);
    expect(totalUsdt).toBeCloseTo(4773, 2);
    // Both rates within sane band given priors.
    const eurRate = parseFloat(eurRow.outcomeAmount!) / parseFloat(eurRow.incomeAmount!);
    expect(eurRate).toBeGreaterThan(0.8); // > 0.8 USDT/EUR
    expect(eurRate).toBeLessThan(1.5);
    const czkRate = parseFloat(czkRow.incomeAmount!) / parseFloat(czkRow.outcomeAmount!);
    expect(czkRate).toBeGreaterThan(15); // 15-30 CZK/USDT band
    expect(czkRate).toBeLessThan(30);
  });

  it("regression: production tx a2c78e8d (audit Bug #2) — same-timestamp 4-leg picks rate-coherent split", () => {
    // Real production tx, all 4 legs created at identical createdAt (bulk insert).
    //   in    54   USDT
    //   out 1,000  EUR
    //   in  1,165  USDT
    //   out 1,140  CZK
    // Pre-fix, chronological pairing was non-deterministic — uuid order picked
    // (54,EUR) which gave 0.054 USDT/EUR (nonsense). With priors, the engine
    // now correctly nets USDT to 1,219 and splits across EUR + CZK by their
    // USDT-equivalent value.
    const prior = priorTxs();
    const tx = txMeta("a2c78e8d", "2026-03-20T15:00:00Z");
    const legs = new Map([
      ...prior.legs,
      ["a2c78e8d", [
        leg("in",  "54",    "USDT", "2026-03-20T15:00:00Z"),
        leg("out", "1000",  "EUR",  "2026-03-20T15:00:00Z"),
        leg("in",  "1165",  "USDT", "2026-03-20T15:00:00Z"),
        leg("out", "1140",  "CZK",  "2026-03-20T15:00:00Z"),
      ]],
    ]);
    const rows = legsToFifoRows([...prior.txs, tx], legs);
    const tgt = rows.filter((r) => r.id === "a2c78e8d");
    // 1 in (USDT) vs 2 outs (EUR, CZK) after netting → 2 rows.
    expect(tgt).toHaveLength(2);
    const eurRow = tgt.find((r) => r.outcomeCurrency === "EUR")!;
    const czkRow = tgt.find((r) => r.outcomeCurrency === "CZK")!;
    // Total USDT preserved.
    const totalUsdt = parseFloat(eurRow.incomeAmount!) + parseFloat(czkRow.incomeAmount!);
    expect(totalUsdt).toBeCloseTo(1219, 1);
    // EUR side gets the bulk of USDT (1000 EUR ≈ 1155 USDT-eq vs 1140 CZK ≈ 54 USDT-eq).
    expect(parseFloat(eurRow.incomeAmount!)).toBeGreaterThan(1100);
    expect(parseFloat(czkRow.incomeAmount!)).toBeLessThan(100);
    // EUR rate near market (1.10-1.20 USDT/EUR).
    const eurRate = parseFloat(eurRow.incomeAmount!) / parseFloat(eurRow.outcomeAmount!);
    expect(eurRate).toBeGreaterThan(1.0);
    expect(eurRate).toBeLessThan(1.3);
  });

  it("regression: production tx 56f6f2d7 (audit Bug #3) — 2x2 multi-out same timestamp", () => {
    // Real production tx, all legs same createdAt:
    //   out  6,858   USDT
    //   in 173,582   CZK
    //   out  8,142   USDT
    //   in   6,000   EUR
    // After netting USDT (same direction so summed): out 15,000 USDT,
    // in 173,582 CZK + 6,000 EUR. Single out, multi in → priors split.
    // 6000 EUR ≈ 6,930 USDT-eq, 173,582 CZK ≈ 8,300 USDT-eq → ~46% / ~54%.
    const prior = priorTxs();
    const tx = txMeta("56f6f2d7", "2026-03-25T11:22:45Z");
    const legs = new Map([
      ...prior.legs,
      ["56f6f2d7", [
        leg("out", "6858",   "USDT", "2026-03-25T11:22:45Z"),
        leg("in",  "173582", "CZK",  "2026-03-25T11:22:45Z"),
        leg("out", "8142",   "USDT", "2026-03-25T11:22:45Z"),
        leg("in",  "6000",   "EUR",  "2026-03-25T11:22:45Z"),
      ]],
    ]);
    const rows = legsToFifoRows([...prior.txs, tx], legs);
    const tgt = rows.filter((r) => r.id === "56f6f2d7");
    expect(tgt).toHaveLength(2);
    const eurRow = tgt.find((r) => r.incomeCurrency === "EUR")!;
    const czkRow = tgt.find((r) => r.incomeCurrency === "CZK")!;
    // Total USDT preserved.
    expect(
      parseFloat(eurRow.outcomeAmount!) + parseFloat(czkRow.outcomeAmount!)
    ).toBeCloseTo(15000, 1);
    // EUR rate near market.
    const eurRate = parseFloat(eurRow.outcomeAmount!) / parseFloat(eurRow.incomeAmount!);
    expect(eurRate).toBeGreaterThan(1.0);
    expect(eurRate).toBeLessThan(1.3);
    // CZK rate near market (15-25 CZK/USDT).
    const czkRate = parseFloat(czkRow.incomeAmount!) / parseFloat(czkRow.outcomeAmount!);
    expect(czkRate).toBeGreaterThan(15);
    expect(czkRate).toBeLessThan(25);
  });

  it("regression: tradeCount dedupes by user-tx ID (audit Bug #4)", () => {
    // One user-tx that spans EUR and CZK should count as 1 trade per pair,
    // not 2. Pre-fix, multi-leg expansion incremented tradeCount twice for
    // each pair the multi-leg row touched.
    const prior = priorTxs();
    const tx = txMeta("multi", "2026-03-25T11:22:45Z");
    const legs = new Map([
      ...prior.legs,
      ["multi", [
        leg("out", "10000",  "USDT", "2026-03-25T11:22:45Z"),
        leg("in",  "8500",   "EUR",  "2026-03-25T11:22:45Z"),
        leg("in",  "30000",  "CZK",  "2026-03-25T11:22:45Z"),
      ]],
    ]);
    const rows = legsToFifoRows([...prior.txs, tx], legs);
    const result = runFifo(rows, FIAT);
    const eur = result.summary.find((s) => s.pair === "EUR/USDT")!;
    const czk = result.summary.find((s) => s.pair === "CZK/USDT")!;
    // Prior txs contribute 2 each + this multi-tx contributes 1 each = 3.
    expect(eur.tradeCount).toBe(3);
    expect(czk.tradeCount).toBe(3);
  });

  it("falls back to even split when no priors are available", () => {
    // Brand-new org: only one ambiguous multi-leg tx, no unambiguous priors.
    // Must not silently drop legs — preserve totals via legacy even-split.
    const tx = txMeta("uneven", "2026-02-01");
    const legs = new Map([
      ["uneven", [
        leg("out", "10000", "USDT", "2026-02-01T10:00:00Z"),
        leg("in",  "5000",  "EUR",  "2026-02-01T10:00:01Z"),
        leg("in",  "100000","CZK",  "2026-02-01T10:00:02Z"),
      ]],
    ]);
    const rows = legsToFifoRows([tx], legs);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(parseFloat(r.outcomeAmount!)).toBeCloseTo(5000);
  });

  it("merges multiple pairs sharing the same currency combo via netting", () => {
    // Two separate USDT→EUR chunks in one tx — netting collapses them to one
    // row with the summed amounts on each side.
    const tx = txMeta("multi", "2026-03-01");
    const legs = new Map([
      ["multi", [
        leg("out", "100", "USDT", "2026-03-01T10:00:00Z"),
        leg("in",  "90",  "EUR",  "2026-03-01T10:00:01Z"),
        leg("out", "200", "USDT", "2026-03-01T10:00:02Z"),
        leg("in",  "180", "EUR",  "2026-03-01T10:00:03Z"),
      ]],
    ]);
    const rows = legsToFifoRows([tx], legs);
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0].incomeAmount!)).toBeCloseTo(270);
    expect(parseFloat(rows[0].outcomeAmount!)).toBeCloseTo(300);
  });

  it("ignores fee legs when pairing", () => {
    const tx = txMeta("withfee", "2026-03-15");
    const legs = new Map([
      ["withfee", [
        leg("out", "1000", "USDT", "2026-03-15T10:00:00Z"),
        { direction: "fee", amount: "5", currency: "USDT", createdAt: "2026-03-15T10:00:01Z" },
        leg("in",  "900",  "EUR",  "2026-03-15T10:00:02Z"),
      ]],
    ]);
    const rows = legsToFifoRows([tx], legs);
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0].outcomeAmount!)).toBeCloseTo(1000);
  });
});
