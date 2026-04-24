"use client";

import { useState, useMemo } from "react";

export interface DisposalEntry {
  pair: string;
  assetCurrency: string;
  baseCurrency: string;
  txId: string;
  disposedAt: string;       // ISO date string
  lotAcquiredAt: string | null;
  amount: number;
  proceedsRate: number;
  costRate: number;
  gain: number;
  gainCurrency: string;
}

function fmtRate(rate: number, base: string, asset: string): string {
  if (rate < 1 && rate > 0) {
    return `${(1 / rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset}/${base}`;
  }
  return `${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${base}/${asset}`;
}

export default function DisposalBreakdown({ disposals }: { disposals: DisposalEntry[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    let list = [...disposals];
    if (from) list = list.filter((d) => d.disposedAt >= from);
    if (to)   list = list.filter((d) => d.disposedAt <= to + "T23:59:59");
    // newest first
    list.sort((a, b) => b.disposedAt.localeCompare(a.disposedAt));
    return list;
  }, [disposals, from, to]);

  const totalGain = filtered.reduce((s, d) => s + d.gain, 0);
  const gainCurrency = filtered[0]?.gainCurrency ?? "";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
      {/* Header + filters */}
      <div className="px-4 py-3 flex items-center gap-4 flex-wrap"
        style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-slate-300">Disposal breakdown</h2>
          <p className="text-xs text-slate-600 mt-0.5">gain = (sell rate − buy rate) × fiat amount, in base currency</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-600">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-7 rounded px-2 text-xs outline-none"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          />
          <span className="text-xs text-slate-600">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-7 rounded px-2 text-xs outline-none"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          />
          {(from || to) && (
            <button
              type="button"
              onClick={() => { setFrom(""); setTo(""); }}
              className="text-xs transition-opacity hover:opacity-60"
              style={{ color: "var(--text-3)" }}
            >
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
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-600">
                No disposals in selected range
              </td>
            </tr>
          ) : (
            filtered.map((d, i) => (
              <tr key={`${d.txId}-${i}`} style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}>
                <td className="px-4 py-2 text-xs font-mono text-slate-500">
                  {d.disposedAt.slice(0, 10)}
                </td>
                <td className="px-4 py-2 text-xs font-mono text-slate-400">{d.pair}</td>
                <td className="px-4 py-2 text-xs font-mono text-right text-slate-300">
                  {d.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                  <span className="text-slate-600">{d.assetCurrency}</span>
                </td>
                <td className="px-4 py-2 text-xs font-mono text-right text-slate-500">
                  {d.costRate === 0
                    ? <span className="text-slate-700">0 (no lot)</span>
                    : fmtRate(d.costRate, d.baseCurrency, d.assetCurrency)}
                </td>
                <td className="px-4 py-2 text-xs font-mono text-right text-slate-400">
                  {fmtRate(d.proceedsRate, d.baseCurrency, d.assetCurrency)}
                </td>
                <td className="px-4 py-2 text-xs text-right text-slate-600">
                  {d.lotAcquiredAt ? d.lotAcquiredAt.slice(0, 10) : <span className="text-slate-700">—</span>}
                </td>
                <td className="px-4 py-2 text-xs font-mono text-right font-medium">
                  <span style={{ color: d.gain >= 0 ? "var(--accent)" : "var(--red)" }}>
                    {d.gain >= 0 ? "+" : ""}{d.gain.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                    <span className="text-slate-600">{d.baseCurrency}</span>
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
