"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { assignClient, unassignClient, createAndAssignClient } from "./actions";

export interface ClientOption {
  id: string;
  name: string;
  surname: string | null;
  tgUsername: string | null;
}

interface Props {
  txId: string;
  current: ClientOption | null;
  clients: ClientOption[];
}

interface DropdownPos {
  top: number;
  right: number;
}

export default function ClientPicker({ txId, current, clients }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [query, setQuery] = useState("");
  const [assigned, setAssigned] = useState<ClientOption | null>(current);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) => {
        const full = [c.name, c.surname, c.tgUsername].filter(Boolean).join(" ").toLowerCase();
        return full.includes(q);
      }).slice(0, 8)
    : clients.slice(0, 8);

  const hasExactMatch = q
    ? clients.some((c) => {
        const full = `${c.name}${c.surname ? " " + c.surname : ""}`.toLowerCase();
        return full === q;
      })
    : false;

  const showCreate = q.length > 0 && !hasExactMatch;

  function handleSelect(client: ClientOption) {
    setAssigned(client);
    setOpen(false);
    startTransition(async () => {
      await assignClient(txId, client.id);
    });
  }

  function handleCreate() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/);
    const name = parts[0];
    const surname = parts.length > 1 ? parts.slice(1).join(" ") : null;
    // Optimistic: set a placeholder while pending
    setAssigned({ id: "", name, surname, tgUsername: null });
    setOpen(false);
    startTransition(async () => {
      const created = await createAndAssignClient(txId, name, surname);
      if (created) setAssigned(created);
    });
  }

  function handleUnassign() {
    setAssigned(null);
    setOpen(false);
    startTransition(async () => {
      await unassignClient(txId);
    });
  }

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  }

  const displayName = assigned
    ? `${assigned.name}${assigned.surname ? " " + assigned.surname : ""}`
    : null;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-all max-w-[130px]"
        style={
          assigned
            ? {
                backgroundColor: "var(--blue-chip-bg)",
                color: "var(--blue)",
                border: "1px solid rgba(96,165,250,.18)",
              }
            : {
                color: "var(--text-3)",
                border: "1px solid transparent",
              }
        }
      >
        {isPending ? (
          <span style={{ color: "var(--text-3)" }}>…</span>
        ) : assigned ? (
          <>
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
              style={{ backgroundColor: "rgba(96,165,250,.25)", color: "var(--blue)" }}
            >
              {assigned.name[0]?.toUpperCase()}
            </span>
            <span className="truncate">{displayName}</span>
          </>
        ) : (
          <span className="hover:opacity-70 transition-opacity">+ client</span>
        )}
      </button>

      {/* Dropdown — rendered in a portal to escape overflow:hidden ancestors */}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            zIndex: 9999,
            minWidth: "220px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border-hi)",
            borderRadius: "10px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div className="p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type a name…"
              className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
              style={{
                backgroundColor: "var(--raised)",
                border: "1px solid var(--border)",
                color: "var(--text-1)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); return; }
                if (e.key === "Enter") {
                  if (filtered[0] && !showCreate) { handleSelect(filtered[0]); return; }
                  if (showCreate) { handleCreate(); return; }
                }
              }}
            />
          </div>

          {/* Client list */}
          <div className="max-h-36 overflow-y-auto">
            {filtered.length === 0 && !showCreate && (
              <p className="px-3 py-3 text-xs" style={{ color: "var(--text-3)" }}>
                No clients found
              </p>
            )}

            {filtered.map((c) => {
              const isAssigned = assigned?.id === c.id;
              return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                style={{
                  color: "var(--text-1)",
                  borderLeft: `2px solid ${isAssigned ? "var(--blue)" : "transparent"}`,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }}
                >
                  {c.name[0]?.toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span>{c.name}{c.surname ? ` ${c.surname}` : ""}</span>
                  {c.tgUsername && (
                    <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
                      @{c.tgUsername}
                    </span>
                  )}
                </span>
                {isAssigned && <span style={{ color: "var(--blue)", fontSize: "10px" }}>✓</span>}
              </button>
              );
            })}

            {/* Create new */}
            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                style={{
                  color: "var(--accent)",
                  borderTop: filtered.length > 0 ? "1px solid var(--inner-border)" : "none",
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
                <span>Create &ldquo;{query.trim()}&rdquo;</span>
              </button>
            )}
          </div>

          {/* Unassign footer */}
          {assigned && (
            <div className="px-3 py-2" style={{ borderTop: "1px solid var(--inner-border)" }}>
              <button
                type="button"
                onClick={handleUnassign}
                className="text-[11px] transition-colors hover:opacity-70"
                style={{ color: "var(--text-3)" }}
              >
                Remove client
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
