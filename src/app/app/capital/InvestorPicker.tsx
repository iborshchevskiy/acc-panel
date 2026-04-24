"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { searchInvestors, createInvestor, type InvestorOption } from "./actions";

interface Props {
  initial: InvestorOption[];
}

interface DropdownPos { top: number; left: number; width: number }

export default function InvestorPicker({ initial }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvestorOption[]>(initial);
  const [selected, setSelected] = useState<InvestorOption | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Live search — debounced a little via transition
  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const rows = await searchInvestors(query);
      setResults(rows);
    });
  }, [query, open]);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        inputRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Position + reposition
  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const q = query.trim();
  const hasExact = q.length > 0 && results.some((r) => r.name.toLowerCase() === q.toLowerCase());
  const showCreate = q.length > 0 && !hasExact && !selected;

  function pick(inv: InvestorOption) {
    setSelected(inv);
    setQuery(inv.name);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleCreate() {
    const name = q;
    if (!name) return;
    startTransition(async () => {
      const result = await createInvestor(name);
      if ("error" in result) return;
      pick(result);
    });
  }

  return (
    <div className="relative">
      {/* Hidden field for form submission */}
      <input type="hidden" name="investor" value={selected?.name ?? query} />
      <input type="hidden" name="investor_id" value={selected?.id ?? ""} />

      <div className="relative">
        <input
          ref={inputRef}
          value={selected?.name ?? query}
          onChange={(e) => {
            if (selected) setSelected(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (results[0] && !showCreate) { pick(results[0]); return; }
              if (showCreate) { handleCreate(); return; }
            }
          }}
          placeholder="Investor — search or create"
          required
          aria-label="Investor"
          className="h-9 w-56 rounded-md px-3 pr-8 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            color: "var(--text-1)",
          }}
        />
        {selected && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear investor"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs transition-colors hover:opacity-70"
            style={{ color: "var(--text-3)" }}
          >×</button>
        )}
      </div>

      {/* Dropdown */}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: Math.max(pos.width, 240),
            zIndex: 9999,
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border-hi)",
            borderRadius: "10px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
          }}
        >
          <div className="max-h-60 overflow-y-auto">
            {results.length === 0 && !showCreate && (
              <p className="px-3 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                {isPending ? "Searching…" : "No investors yet — type a name to create one"}
              </p>
            )}

            {results.map((inv) => {
              const isSelected = selected?.id === inv.id;
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => pick(inv)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                  style={{
                    color: "var(--text-1)",
                    borderLeft: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}
                  >
                    {inv.name[0]?.toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{inv.name}</span>
                  {isSelected && <span style={{ color: "var(--accent)", fontSize: "10px" }}>✓</span>}
                </button>
              );
            })}

            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={isPending}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                style={{
                  color: "var(--accent)",
                  borderTop: results.length > 0 ? "1px solid var(--inner-border)" : "none",
                  borderLeft: "2px solid transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(16,185,129,0.06)";
                  (e.currentTarget as HTMLElement).style.borderLeftColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.borderLeftColor = "transparent";
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}
                >+</span>
                <span>{isPending ? "Creating…" : `Create "${q}" as new investor`}</span>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
