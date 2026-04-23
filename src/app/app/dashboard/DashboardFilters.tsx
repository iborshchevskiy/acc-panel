"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  { label: "Today",  days: 0  },
  { label: "7d",     days: 7  },
  { label: "30d",    days: 30 },
  { label: "3m",     days: 90 },
  { label: "YTD",    days: -1 }, // special
  { label: "All",    days: -2 }, // special
] as const;

interface Props {
  from: string;
  to: string;
  preset: string;
}

export default function DashboardFilters({ from, to, preset }: Props) {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo]   = useState(to);

  function navigate(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    router.push(`/app/dashboard?${qs}`);
    setCustomOpen(false);
  }

  function applyPreset(days: number) {
    const today = new Date();
    const toStr = today.toISOString().slice(0, 10);
    if (days === -2) { navigate({ preset: "all" }); return; }
    if (days === -1) {
      const fromStr = `${today.getUTCFullYear()}-01-01`;
      navigate({ preset: "ytd", from: fromStr, to: toStr });
      return;
    }
    if (days === 0) {
      navigate({ preset: "today", from: toStr, to: toStr });
      return;
    }
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - days);
    navigate({ preset: `${days}d`, from: fromDate.toISOString().slice(0, 10), to: toStr });
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    navigate({ preset: "custom", from: customFrom, to: customTo });
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

  const activeBtn: React.CSSProperties = {
    backgroundColor: "var(--raised-hi)",
    border: "1px solid var(--border-hi)",
    color: "var(--text-1)",
  };
  const idleBtn: React.CSSProperties = {
    backgroundColor: "transparent",
    border: "1px solid transparent",
    color: "var(--text-4)",
  };

  const presetKey = preset || "mtd";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* MTD — built-in preset */}
      <button
        type="button"
        onClick={() => navigate({ preset: "mtd" })}
        className="h-6 px-2.5 rounded text-xs font-medium transition-all"
        style={presetKey === "mtd" ? activeBtn : idleBtn}
      >
        MTD
      </button>

      {PRESETS.map((p) => {
        const key = p.days === -2 ? "all" : p.days === -1 ? "ytd" : p.days === 0 ? "today" : `${p.days}d`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => applyPreset(p.days)}
            className="h-6 px-2.5 rounded text-xs font-medium transition-all"
            style={presetKey === key ? activeBtn : idleBtn}
          >
            {p.label}
          </button>
        );
      })}

      {/* Custom */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="h-6 px-2.5 rounded text-xs font-medium transition-all"
          style={presetKey === "custom" ? activeBtn : idleBtn}
        >
          {presetKey === "custom" ? `${from} → ${to}` : "Custom"}
        </button>
        {customOpen && (
          <div
            className="absolute right-0 mt-1.5 z-50 flex flex-col gap-2 p-3 rounded-xl"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border-hi)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24)",
              minWidth: 200,
              top: "100%",
            }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-[10px]" style={{ color: "var(--text-4)" }}>From</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px]" style={{ color: "var(--text-4)" }}>To</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={inputStyle} />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="mt-1 h-7 rounded text-xs font-medium disabled:opacity-40"
              style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-1)" }}
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
