"use client";

import { useState } from "react";
import CryptoLogo from "./CryptoLogo";

const CHAINS = [
  { code: "TRX", name: "TRON",     color: "#EF0027" },
  { code: "ETH", name: "Ethereum", color: "#627EEA" },
  { code: "BNB", name: "BNB",      color: "#F3BA2F" },
  { code: "SOL", name: "Solana",   color: "#9945FF" },
] as const;

export default function ChainRail() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2 flex-wrap pt-6 mt-4"
      style={{ borderTop: "1px solid var(--border)" }}>
      <span className="text-[9px] font-mono uppercase tracking-[0.18em] mr-2"
        style={{ color: "var(--text-3)" }}>
        Native chains
      </span>
      {CHAINS.map(c => {
        const isActive = active === c.code;
        const isDimmed = active !== null && !isActive;
        return (
          <button
            key={c.code}
            type="button"
            onMouseEnter={() => setActive(c.code)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(c.code)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(prev => prev === c.code ? null : c.code)}
            className="group flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 transition-all"
            style={{
              backgroundColor: isActive
                ? `color-mix(in srgb, ${c.color} 12%, transparent)`
                : isDimmed
                ? "transparent"
                : "color-mix(in srgb, var(--surface) 60%, transparent)",
              border: `1px solid ${isActive
                ? `color-mix(in srgb, ${c.color} 50%, transparent)`
                : "var(--border)"}`,
              opacity: isDimmed ? 0.45 : 1,
              transform: isActive ? "translateY(-1px)" : "translateY(0)",
              boxShadow: isActive
                ? `0 6px 18px -6px color-mix(in srgb, ${c.color} 55%, transparent)`
                : "none",
            }}
          >
            <CryptoLogo symbol={c.code} size={18} />
            <span className="text-[11px] font-medium transition-colors"
              style={{ color: isActive ? "var(--text-1)" : "var(--text-2)" }}>
              {c.name}
            </span>
            <span className="text-[9px] font-mono transition-colors"
              style={{ color: isActive ? c.color : "var(--text-3)" }}>
              {c.code}
            </span>
          </button>
        );
      })}
    </div>
  );
}
