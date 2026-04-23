"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  active: boolean;
  initialFrom: string;
  initialTo: string;
}

export default function CustomRangePicker({ active, initialFrom, initialTo }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [open, setOpen] = useState(active);

  function apply() {
    if (!from || !to) return;
    router.push(`?bucket=custom&from=${from}&to=${to}`);
    setOpen(false);
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--inner-border)",
    color: "var(--text-1)",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 12,
    outline: "none",
    colorScheme: "dark",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-3 flex items-center rounded text-xs font-medium transition-colors"
        style={active
          ? { backgroundColor: "var(--accent)", color: "var(--surface)" }
          : { color: "var(--text-2)" }}
      >
        Custom
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 z-50 flex flex-col gap-2 p-3 rounded-xl"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border-hi)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24)",
            minWidth: 220,
            top: "100%",
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium" style={{ color: "var(--text-3)" }}>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium" style={{ color: "var(--text-3)" }}>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={!from || !to}
            className="mt-1 h-7 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
