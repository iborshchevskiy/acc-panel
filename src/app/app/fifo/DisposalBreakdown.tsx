"use client";

import { useState, useMemo, Fragment } from "react";
import Link from "next/link";

export interface LegInfo {
  direction: string;
  amount: string | null;
  currency: string | null;
  location: string | null;
}

export interface DisposalEntry {
  pair: string;
  assetCurrency: string;
  baseCurrency: string;
  txId: string;
  lotTxId: string | null;
  disposedAt: string;
  lotAcquiredAt: string | null;
  amount: number;
  proceedsRate: number;
  costRate: number;
  gain: number;
  gainCurrency: string;
  buyLegs: LegInfo[];
  sellLegs: LegInfo[];
}

function fmtRate(rate: number, base: string, asset: string): string {
  if (rate < 1 && rate > 0) {
    return `${(1 / rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset}/${base}`;
  }
  return `${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${base}/${asset}`;
}

function shortAddr(s: string | null) {
  if (!s) return null;
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

function LegChip({ leg }: { leg: LegInfo }) {
  const isIn = leg.direction === "in";
  const color = isIn ? "var(--accent)" : "var(--red)";
  const sign = isIn ? "+" : "−";
  const amt = leg.amount ? parseFloat(leg.amount).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono" style={{ color }}>
        {sign}{amt} {leg.currency ?? ""}
      </span>
      {leg.location && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "var(--text-4)", border: "1px solid var(--inner-border)" }}
          title={leg.location}>
          {shortAddr(leg.location)}
        </span>
      )}
    </div>
  );
}

function ExpandPanel({ d, open }: { d: DisposalEntry; open: boolean }) {
  const gainPositive = d.gain >= 0;
  const gainColor = gainPositive ? "var(--accent)" : "var(--red)";

  const proceedsFormatted = fmtRate(d.proceedsRate, d.baseCurrency, d.assetCurrency);
  const costFormatted = d.costRate === 0 ? "—" : fmtRate(d.costRate, d.baseCurrency, d.assetCurrency);

  // Rate delta for formula — always in base/asset direction for the formula display
  const proceedsBase = d.proceedsRate;
  const costBase = d.costRate;
  const delta = proceedsBase - costBase;
  const gainCalc = delta * d.amount;

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: open ? "1fr" : "0fr",
      transition: "grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1)",
    }}>
      <div style={{ overflow: "hidden" }}>
        <div className="px-4 py-4" style={{
          borderTop: open ? "1px solid var(--inner-border)" : "none",
          backgroundColor: "color-mix(in srgb, var(--surface) 60%, transparent)",
        }}>
          <div className="grid gap-3 sm:[grid-template-columns:1fr_auto_1fr]">

            {/* BUY side */}
            <div className="rounded-lg p-3 flex flex-col gap-2" style={{
              backgroundColor: "rgba(16,185,129,0.04)",
              border: "1px solid rgba(16,185,129,0.12)",
            }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent)" }}>
                  Buy
                </span>
                {d.lotTxId && (
                  <Link href={`/app/transactions?tx=${d.lotTxId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] font-mono transition-opacity hover:opacity-60"
                    style={{ color: "var(--text-4)" }}
                    title={d.lotTxId}>
                    {d.lotTxId.slice(0, 8)} ↗
                  </Link>
                )}
              </div>
              <div className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
                {d.lotAcquiredAt ? d.lotAcquiredAt.slice(0, 16).replace("T", " ") : "—"}
              </div>
              <div className="flex flex-col gap-1 pt-1" style={{ borderTop: "1px solid rgba(16,185,129,0.08)" }}>
                {d.buyLegs.length > 0
                  ? d.buyLegs.map((l, i) => <LegChip key={i} leg={l} />)
                  : <span className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>no leg data</span>
                }
              </div>
              <div className="text-[11px] font-mono mt-1" style={{ color: "var(--text-3)" }}>
                @ {costFormatted}
              </div>
            </div>

            {/* Arrow connector */}
            <div className="flex flex-col items-center justify-center gap-1.5 px-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-4)" }}>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="text-[9px] font-mono text-center" style={{ color: "var(--text-4)" }}>
                {d.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}<br />
                {d.assetCurrency}
              </div>
            </div>

            {/* SELL side */}
            <div className="rounded-lg p-3 flex flex-col gap-2" style={{
              backgroundColor: "rgba(239,68,68,0.04)",
              border: "1px solid rgba(239,68,68,0.12)",
            }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--red)" }}>
                  Sell
                </span>
                <Link href={`/app/transactions?tx=${d.txId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] font-mono transition-opacity hover:opacity-60"
                  style={{ color: "var(--text-4)" }}
                  title={d.txId}>
                  {d.txId.slice(0, 8)} ↗
                </Link>
              </div>
              <div className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
                {d.disposedAt.slice(0, 16).replace("T", " ")}
              </div>
              <div className="flex flex-col gap-1 pt-1" style={{ borderTop: "1px solid rgba(239,68,68,0.08)" }}>
                {d.sellLegs.length > 0
                  ? d.sellLegs.map((l, i) => <LegChip key={i} leg={l} />)
                  : <span className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>no leg data</span>
                }
              </div>
              <div className="text-[11px] font-mono mt-1" style={{ color: "var(--text-3)" }}>
                @ {proceedsFormatted}
              </div>
            </div>
          </div>

          {/* Gain formula */}
          <div className="mt-3 rounded-md px-3 py-2 flex items-center gap-2 flex-wrap" style={{
            backgroundColor: `color-mix(in srgb, ${gainPositive ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)"} 100%, transparent)`,
            border: `1px solid ${gainPositive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}`,
          }}>
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-4)" }}>
              Gain
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>
              ({proceedsBase.toFixed(6)} − {costBase.toFixed(6)}) × {d.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {d.assetCurrency}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-4)" }}>=</span>
            <span className="text-sm font-mono font-semibold" style={{ color: gainColor }}>
              {gainCalc >= 0 ? "+" : ""}{gainCalc.toLocaleString(undefined, { maximumFractionDigits: 4 })} {d.baseCurrency}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DisposalBreakdown({ disposals }: { disposals: DisposalEntry[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    let list = [...disposals];
    if (from) list = list.filter((d) => d.disposedAt >= from);
    if (to)   list = list.filter((d) => d.disposedAt <= to + "T23:59:59");
    list.sort((a, b) => b.disposedAt.localeCompare(a.disposedAt));
    return list;
  }, [disposals, from, to]);

  // Reset expanded when filter changes
  const [prevFiltered, setPrevFiltered] = useState(filtered);
  if (prevFiltered !== filtered) {
    setPrevFiltered(filtered);
    setExpanded(new Set());
  }

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  const totalGain = filtered.reduce((s, d) => s + d.gain, 0);
  const gainCurrency = filtered[0]?.gainCurrency ?? "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-4 flex-wrap"
        style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-slate-300">Disposal breakdown</h2>
          <p className="text-xs text-slate-600 mt-0.5">gain = (sell rate − buy rate) × fiat amount, in base currency</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-600">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="h-7 rounded px-2 text-xs outline-none"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-2)" }} />
          <span className="text-xs text-slate-600">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="h-7 rounded px-2 text-xs outline-none"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-2)" }} />
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }}
              className="text-xs transition-opacity hover:opacity-60" style={{ color: "var(--text-3)" }}>
              Clear
            </button>
          )}
        </div>
        {filtered.length > 0 && (
          <div className="text-xs font-mono shrink-0" style={{ color: totalGain >= 0 ? "var(--accent)" : "var(--red)" }}>
            {totalGain >= 0 ? "+" : ""}{totalGain.toLocaleString(undefined, { maximumFractionDigits: 4 })} {gainCurrency}
            <span className="text-slate-600 ml-1">({filtered.length})</span>
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Date</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Pair</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Fiat amount</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Buy rate</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Sell rate</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Lot acquired</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Gain</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-600">
                No disposals in selected range
              </td>
            </tr>
          ) : (
            filtered.map((d, i) => {
              const isOpen = expanded.has(i);
              const gainColor = d.gain >= 0 ? "var(--accent)" : "var(--red)";
              return (
                <Fragment key={`${d.txId}-${i}`}>
                  <tr
                    style={{
                      backgroundColor: isOpen ? "color-mix(in srgb, var(--raised-hi) 80%, transparent)" : "var(--surface)",
                      borderBottom: isOpen ? "none" : "1px solid var(--inner-border)",
                      transition: "background-color 200ms ease",
                      cursor: "pointer",
                    }}
                    onClick={() => toggle(i)}
                  >
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                      {d.disposedAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-400">{d.pair}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-300">
                      {d.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                      <span className="text-slate-600">{d.assetCurrency}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-500">
                      {d.costRate === 0
                        ? <span className="text-slate-700">0 (no lot)</span>
                        : fmtRate(d.costRate, d.baseCurrency, d.assetCurrency)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right text-slate-400">
                      {fmtRate(d.proceedsRate, d.baseCurrency, d.assetCurrency)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right text-slate-600">
                      {d.lotAcquiredAt ? d.lotAcquiredAt.slice(0, 10) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-right font-medium">
                      <span style={{ color: gainColor }}>
                        {d.gain >= 0 ? "+" : ""}{d.gain.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                        <span className="text-slate-600">{d.baseCurrency}</span>
                      </span>
                    </td>
                    <td className="pr-3 text-right">
                      <svg
                        width="14" height="14" viewBox="0 0 14 14" fill="none"
                        style={{
                          display: "inline-block",
                          color: isOpen ? "var(--accent)" : "var(--text-4)",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 280ms cubic-bezier(0.4,0,0.2,1), color 200ms ease",
                        }}
                      >
                        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4"
                          strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--inner-border)" }}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <ExpandPanel d={d} open={isOpen} />
                    </td>
                  </tr>
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
