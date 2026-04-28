"use client";

import { useState, useRef, useEffect } from "react";

const CHAINS = [
  { value: "TRON", label: "TRON",      color: "var(--red)" },
  { value: "ETH",  label: "Ethereum",  color: "var(--indigo)" },
  { value: "BNB",  label: "BNB Chain", color: "var(--amber)" },
  { value: "SOL",  label: "Solana",    color: "var(--accent)" },
] as const;

type ChainValue = typeof CHAINS[number]["value"];

const dropdownPanel: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 color-mix(in srgb, var(--text-1) 5%, transparent)",
  borderRadius: "10px",
  overflow: "hidden",
};

export default function ChainPicker({ defaultValue = "TRON" }: { defaultValue?: ChainValue }) {
  const [selected, setSelected] = useState<ChainValue>(defaultValue);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<ChainValue | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = CHAINS.find((c) => c.value === selected)!;

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="chain" value={selected} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 flex items-center gap-2 rounded-md px-3 text-sm font-medium transition-all"
        style={{
          backgroundColor: current.color + "18",
          border: `1px solid ${current.color}30`,
          color: current.color,
          minWidth: "120px",
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: current.color }}
        />
        <span className="flex-1 text-left">{current.label}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", opacity: 0.5 }}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-40" style={{ top: "100%", ...dropdownPanel }}>
          {CHAINS.map((chain) => {
            const isSelected = chain.value === selected;
            const isHovered = chain.value === hovered;
            return (
              <button
                key={chain.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelected(chain.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setHovered(chain.value)}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left transition-colors"
                style={{
                  backgroundColor: isHovered ? "color-mix(in srgb, var(--text-1) 6%, transparent)" : "transparent",
                  borderLeft: `2px solid ${isSelected ? chain.color : "transparent"}`,
                  color: isSelected ? chain.color : "var(--text-1)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: chain.color }}
                />
                <span className="flex-1">{chain.label}</span>
                {isSelected && (
                  <span style={{ color: chain.color, fontSize: "10px" }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
