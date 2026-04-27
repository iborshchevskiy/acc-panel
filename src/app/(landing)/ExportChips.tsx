"use client";

import { useState } from "react";

const FORMATS = [
  { code: "CSV",  hint: "semicolon · Excel-native" },
  { code: "JSON", hint: "raw ledger" },
  { code: "XLSX", hint: "spreadsheet" },
  { code: "PDF",  hint: "signed report" },
] as const;

export default function ExportChips() {
  const [selected, setSelected] = useState<string>("CSV");

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {FORMATS.map(f => {
          const isSel = selected === f.code;
          return (
            <button
              key={f.code}
              type="button"
              onClick={() => setSelected(f.code)}
              className="text-[11px] font-mono font-semibold px-3.5 py-2 rounded-md transition-all"
              style={{
                backgroundColor: isSel
                  ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                  : "var(--raised)",
                border: isSel
                  ? "1px solid color-mix(in srgb, var(--accent) 45%, transparent)"
                  : "1px solid var(--border)",
                color: isSel ? "var(--accent)" : "var(--text-3)",
                opacity: selected && !isSel ? 0.45 : 1,
                transform: isSel ? "translateY(-1px)" : "translateY(0)",
                boxShadow: isSel
                  ? "0 6px 16px -6px color-mix(in srgb, var(--accent) 50%, transparent)"
                  : "none",
              }}
            >
              {f.code}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] font-mono h-3 transition-opacity sm:text-right"
        style={{ color: "var(--text-3)" }}>
        {FORMATS.find(f => f.code === selected)?.hint ?? ""}
      </p>
    </div>
  );
}
