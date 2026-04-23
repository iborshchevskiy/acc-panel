"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const TX_TYPE_COLORS: Record<string, string> = {
  Exchange: "var(--indigo)",
  Revenue:  "var(--accent)",
  Expense:  "var(--red)",
  Debt:     "var(--amber)",
  Transfer: "var(--text-2)",
  Fee:      "var(--violet)",
};

interface Props {
  q: string;
  typeFilter: string;
  txTypes: string[];
  total: number;
}

export default function TransactionFilters({ q, typeFilter, txTypes, total }: Props) {
  const router = useRouter();
  const [qVal, setQVal] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(newQ: string, newType: string) {
    const params = new URLSearchParams();
    if (newQ) params.set("q", newQ);
    if (newType) params.set("type", newType);
    const qs = params.toString();
    router.push(`/app/transactions${qs ? `?${qs}` : ""}`);
  }

  function handleSearch(value: string) {
    setQVal(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(value, typeFilter), 350);
  }

  function handleTypeClick(type: string) {
    navigate(qVal, typeFilter === type ? "" : type);
  }

  const hasFilter = qVal || typeFilter;

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--inner-border)", backgroundColor: "var(--raised-hi)" }}
    >
      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-4)" }}
        >
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={qVal}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQVal(""); navigate("", typeFilter); } }}
          placeholder="Search TxID, address, currency, comment…"
          className="h-7 w-full rounded-md pl-8 pr-3 text-xs outline-none transition-colors"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-1)",
          }}
        />
        {qVal && (
          <button
            type="button"
            onClick={() => { setQVal(""); navigate("", typeFilter); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs leading-none transition-opacity hover:opacity-80"
            style={{ color: "var(--text-4)" }}
          >
            ×
          </button>
        )}
      </div>

      {/* Type chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {txTypes.map((t) => {
          const color = TX_TYPE_COLORS[t] ?? "var(--text-2)";
          const active = typeFilter === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeClick(t)}
              className="h-6 rounded-full px-2.5 text-[11px] font-medium transition-all"
              style={{
                backgroundColor: active ? color + "28" : "transparent",
                border: `1px solid ${active ? color + "55" : "var(--border)"}`,
                color: active ? color : "var(--text-4)",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Result count + clear */}
      <div className="flex items-center gap-2 ml-auto">
        {hasFilter && (
          <>
            <span className="text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
              {total.toLocaleString()} result{total !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => { setQVal(""); router.push("/app/transactions"); }}
              className="text-xs px-2 h-5 rounded transition-colors"
              style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}
            >
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}
