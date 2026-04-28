"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { searchInvestors, createInvestor, type InvestorOption } from "./actions";

interface Props {
  initial: InvestorOption[];
}

interface DropdownPos { top: number; left: number; width: number }

export default function InvestorPicker({ initial }: Props) {
  // Single source of truth for the text in the input. `selectedId` tracks
  // which DB row (if any) backs that text — set when the user picks from the
  // dropdown, cleared the moment they type anything else.
  const [inputValue, setInputValue] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<InvestorOption[]>(initial);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search on every keystroke with a 120ms debounce + stale-check.
  // Runs independently of `open` — results are fresh the moment the dropdown
  // opens. Errors surface to the user; no silent failure.
  useEffect(() => {
    let stale = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchInvestors(inputValue);
        if (!stale) {
          setResults(rows);
          setErrMsg(null);
        }
      } catch (err) {
        if (!stale) {
          console.error("[InvestorPicker] search failed:", err);
          setErrMsg("Search failed — see dev console.");
        }
      } finally {
        if (!stale) setSearching(false);
      }
    }, 120);
    return () => { stale = true; clearTimeout(timer); };
  }, [inputValue]);

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

  const reposition = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  const q = inputValue.trim();
  const hasExact = q.length > 0 && results.some((r) => r.name.toLowerCase() === q.toLowerCase());
  const showCreate = q.length > 0 && !hasExact;

  function pick(inv: InvestorOption) {
    setInputValue(inv.name);
    setSelectedId(inv.id);
    setOpen(false);
  }

  function clear() {
    setInputValue("");
    setSelectedId(null);
    inputRef.current?.focus();
    setOpen(true);
  }

  async function handleCreate() {
    const name = q;
    if (!name || creating) return;
    setCreating(true);
    try {
      const result = await createInvestor(name);
      if ("error" in result) {
        setErrMsg(result.error);
        return;
      }
      pick(result);
      // Pull a fresh list so the new investor appears in later searches
      try {
        const rows = await searchInvestors("");
        setResults(rows);
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      console.error("[InvestorPicker] create failed:", err);
      setErrMsg("Create failed — see dev console.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative">
      {/* Hidden fields for form submission — `investor` is the display name,
          `investor_id` is the resolved UUID when one is known. */}
      <input type="hidden" name="investor" value={inputValue} />
      <input type="hidden" name="investor_id" value={selectedId ?? ""} />

      <div className="relative">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (selectedId) setSelectedId(null);
            setOpen(true);
          }}
          onFocus={() => { setOpen(true); reposition(); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (e.key === "ArrowDown" && !open) { setOpen(true); return; }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (results[0] && !showCreate) { pick(results[0]); return; }
              if (showCreate) { handleCreate(); return; }
            }
          }}
          placeholder="Investor — search or create"
          required
          aria-label="Investor"
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
          className="h-9 w-56 rounded-md px-3 pr-8 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          style={{
            backgroundColor: "color-mix(in srgb, var(--text-1) 6%, transparent)",
            color: "var(--text-1)",
          }}
        />
        {inputValue && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear investor"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs transition-colors hover:opacity-70"
            style={{ color: "var(--text-3)" }}
            tabIndex={-1}
          >×</button>
        )}
      </div>

      {/* Dropdown */}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: Math.max(pos.width, 260),
            zIndex: 9999,
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border-hi)",
            borderRadius: "10px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 color-mix(in srgb, var(--text-1) 5%, transparent)",
            overflow: "hidden",
          }}
        >
          {errMsg && (
            <div className="px-3 py-2 text-[11px]" style={{
              backgroundColor: "var(--red-alert-bg)",
              color: "var(--red)",
              borderBottom: "1px solid var(--inner-border)",
            }}>{errMsg}</div>
          )}

          <div className="max-h-60 overflow-y-auto">
            {/* Onboarding hint: empty list with empty query */}
            {results.length === 0 && q.length === 0 && !searching && (
              <p className="px-3 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                No investors yet. Type a name and press Enter to add the first one.
              </p>
            )}

            {/* Searching placeholder — only when we have nothing to show yet */}
            {searching && results.length === 0 && !showCreate && (
              <p className="px-3 py-3 text-xs" style={{ color: "var(--text-3)" }}>Searching…</p>
            )}

            {/* Match rows */}
            {results.map((inv) => {
              const isSelected = selectedId === inv.id;
              return (
                <button
                  key={inv.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(inv)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                  style={{
                    color: "var(--text-1)",
                    borderLeft: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in srgb, var(--text-1) 6%, transparent)"; }}
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

            {/* Create-new row */}
            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                style={{
                  color: "var(--accent)",
                  borderTop: results.length > 0 ? "1px solid var(--inner-border)" : "none",
                  borderLeft: "2px solid transparent",
                  opacity: creating ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in srgb, var(--accent) 8%, transparent)";
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
                <span>{creating ? "Creating…" : `Create "${q}" as new investor`}</span>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
