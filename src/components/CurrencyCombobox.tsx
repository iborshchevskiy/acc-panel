"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Self-managing currency combobox for native form submission.
 *
 * Renders a real `<input name=...>` so the parent form can be a server-action
 * form without any extra plumbing. As the user types, a popover lists the
 * matching org currencies (most popular first — pass `codes` already sorted).
 * Click or Enter selects; Escape closes; Tab leaves the typed value in place.
 *
 * For controlled use cases inside a stateful form (e.g. ManualTransactionForm)
 * keep using the local CurrencyCombobox in that file — it has explicit
 * value/onChange.
 */
interface Props {
  name: string;
  codes: string[];
  defaultValue?: string;
  placeholder?: string;
  /** Pass-through wrapper class (controls width, etc.) */
  wrapperClassName?: string;
  /** Pass-through input class */
  inputClassName?: string;
  /** Pass-through input inline style */
  inputStyle?: React.CSSProperties;
  /** Required-attribute on the input */
  required?: boolean;
}

const dropdownPanel: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 color-mix(in srgb, var(--text-1) 5%, transparent)",
  borderRadius: "10px",
  overflow: "hidden",
};

export default function CurrencyCombobox({
  name,
  codes,
  defaultValue = "",
  placeholder = "CCY",
  wrapperClassName,
  inputClassName,
  inputStyle,
  required,
}: Props) {
  const [value, setValue] = useState(defaultValue.toUpperCase());
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = value.toUpperCase();
  const filtered = q.length > 0
    ? codes.filter((c) => c.startsWith(q) || c.includes(q)).slice(0, 8)
    : codes.slice(0, 8);

  return (
    <div ref={containerRef} className={"relative " + (wrapperClassName ?? "w-24")}>
      <input
        name={name}
        value={value}
        onChange={(e) => { setValue(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key === "Tab") { setOpen(false); return; }
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[0]) { setValue(filtered[0]); setOpen(false); }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        required={required}
        className={inputClassName ?? "w-full font-mono uppercase tracking-wide bg-transparent border-b pb-1 text-sm outline-none transition-colors focus:border-emerald-500"}
        style={inputStyle ?? { borderColor: "var(--inner-border)", color: "var(--text-1)" }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 z-50 mt-1.5 min-w-[120px]" style={{ top: "100%", ...dropdownPanel }}>
          <div className="max-h-44 overflow-y-auto">
            {filtered.map((c) => {
              const isSelected = c === value;
              const isHovered = c === hovered;
              return (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setValue(c); setOpen(false); }}
                  onMouseEnter={() => setHovered(c)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-mono text-left transition-colors"
                  style={{
                    color: isSelected ? "var(--accent)" : "var(--text-1)",
                    backgroundColor: isHovered ? "color-mix(in srgb, var(--text-1) 6%, transparent)" : "transparent",
                    borderLeft: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <span>{c}</span>
                  {isSelected && (
                    <span style={{ color: "var(--accent)", fontSize: "10px" }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
