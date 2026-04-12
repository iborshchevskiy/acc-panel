"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  q: string;
  typeFilter: string;
  txTypes: string[];
}

export default function TransactionFilters({ q, typeFilter, txTypes }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qVal = inputRef.current?.value ?? "";
    const typeVal = selectRef.current?.value ?? "";
    const params = new URLSearchParams();
    if (qVal) params.set("q", qVal);
    if (typeVal) params.set("type", typeVal);
    const qs = params.toString();
    router.push(`/app/transactions${qs ? `?${qs}` : ""}`);
  }

  function handleClear() {
    router.push("/app/transactions");
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text-1)",
  };

  const btnStyle: React.CSSProperties = {
    backgroundColor: "var(--raised)",
    border: "1px solid var(--border)",
    color: "var(--text-1)",
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
      <input
        ref={inputRef}
        name="q"
        defaultValue={q}
        placeholder="Search TxID, address, currency, comment…"
        className="h-8 flex-1 min-w-56 rounded-md px-3 text-sm outline-none focus:ring-1 transition-colors"
        style={inputStyle}
      />
      <select
        ref={selectRef}
        name="type"
        defaultValue={typeFilter}
        className="h-8 rounded-md px-3 text-sm outline-none focus:ring-1 transition-colors"
        style={inputStyle}
      >
        <option value="">All types</option>
        {txTypes.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button
        type="submit"
        className="h-8 rounded-md px-3 text-sm font-medium transition-colors"
        style={btnStyle}
      >
        Filter
      </button>
      {(q || typeFilter) && (
        <button
          type="button"
          onClick={handleClear}
          className="h-8 flex items-center rounded-md px-3 text-sm transition-colors"
          style={{ color: "var(--text-3)" }}
        >
          Clear ×
        </button>
      )}
    </form>
  );
}
