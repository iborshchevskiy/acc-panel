"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { createExpense } from "./actions";
import type { ClientOption } from "../transactions/ClientPicker";

const inputCls = "bg-transparent border-b pb-1 text-sm outline-none transition-colors focus:border-emerald-500";
const inputStyle = { borderColor: "var(--inner-border)", color: "var(--text-1)" };

const dropdownPanel: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 color-mix(in srgb, var(--text-1) 5%, transparent)",
  borderRadius: "10px",
  overflow: "hidden",
};

// ── Currency combobox ─────────────────────────────────────────────────────────

function CurrencyCombobox({ value, codes, onChange }: { value: string; codes: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const q = value.toUpperCase();
  const filtered = q ? codes.filter((c) => c.startsWith(q) || c.includes(q)).slice(0, 8) : codes.slice(0, 8);

  return (
    <div ref={ref} className="relative w-24">
      <input name="currency" value={value}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key === "Tab") { setOpen(false); return; }
          if (e.key === "Enter") { e.preventDefault(); if (filtered[0]) { onChange(filtered[0]); setOpen(false); } }
        }}
        placeholder="CCY" autoComplete="off" spellCheck={false}
        className={`${inputCls} w-full font-mono text-xs tracking-wide`} style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 z-50 mt-1.5 min-w-[96px]" style={{ top: "100%", ...dropdownPanel }}>
          <div className="max-h-36 overflow-y-auto">
            {filtered.map((c) => {
              const isSel = c === value;
              return (
                <button key={c} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}
                  onMouseEnter={() => setHovered(c)} onMouseLeave={() => setHovered(null)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-mono text-left"
                  style={{
                    color: isSel ? "var(--accent)" : "var(--text-1)",
                    backgroundColor: hovered === c ? "color-mix(in srgb, var(--text-1) 6%, transparent)" : "transparent",
                    borderLeft: `2px solid ${isSel ? "var(--accent)" : "transparent"}`,
                  }}>
                  <span>{c}</span>
                  {isSel && <span style={{ color: "var(--accent)", fontSize: "10px" }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Client field ──────────────────────────────────────────────────────────────

type PendingClient =
  | { mode: "existing"; id: string; name: string; surname: string | null }
  | { mode: "create"; name: string; surname: string | null }
  | null;

function ClientField({ clients }: { clients: ClientOption[] }) {
  const [pending, setPending] = useState<PendingClient>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) => [c.name, c.surname, c.tgUsername].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 8)
    : clients.slice(0, 8);
  const hasExact = q ? clients.some((c) => `${c.name}${c.surname ? " " + c.surname : ""}`.toLowerCase() === q) : false;

  function selectExisting(c: ClientOption) {
    setPending({ mode: "existing", id: c.id, name: c.name, surname: c.surname });
    setQuery(`${c.name}${c.surname ? " " + c.surname : ""}`);
    setOpen(false);
  }
  function selectCreate() {
    const t = query.trim(); if (!t) return;
    const parts = t.split(/\s+/);
    setPending({ mode: "create", name: parts[0], surname: parts.length > 1 ? parts.slice(1).join(" ") : null });
    setOpen(false);
  }
  function clear() { setPending(null); setQuery(""); }

  return (
    <div ref={ref} className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: "var(--text-3)" }}>Client</span>
      {pending?.mode === "existing" && <input type="hidden" name="client_id" value={pending.id} />}
      {pending?.mode === "create" && <>
        <input type="hidden" name="client_create_name" value={pending.name} />
        {pending.surname && <input type="hidden" name="client_create_surname" value={pending.surname} />}
      </>}
      <div className="relative">
        <div className="flex items-center gap-1">
          <input value={query}
            onChange={(e) => { setQuery(e.target.value); setPending(null); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); return; }
              if (e.key === "Enter") {
                e.preventDefault();
                if (!query.trim() && filtered[0]) { selectExisting(filtered[0]); return; }
                if (!hasExact && query.trim()) { selectCreate(); return; }
                if (filtered[0]) selectExisting(filtered[0]);
              }
            }}
            placeholder="Search or type name…"
            className={`${inputCls} flex-1 text-sm`}
            style={{ ...inputStyle, color: pending ? "var(--accent)" : "var(--text-1)" }}
            autoComplete="off"
          />
          {pending && <button type="button" onClick={clear} className="shrink-0 text-xs hover:opacity-60" style={{ color: "var(--text-3)" }}>×</button>}
        </div>
        {pending && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={pending.mode === "existing"
                ? { backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }
                : { backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>
              {pending.mode === "existing" ? "↗" : "+"} {pending.name}{pending.surname ? " " + pending.surname : ""}
            </span>
            {pending.mode === "create" && <span className="text-[10px]" style={{ color: "var(--text-3)" }}>will be created</span>}
          </div>
        )}
        {open && (
          <div className="absolute left-0 z-50 mt-1.5 w-[240px]" style={{ top: "100%", ...dropdownPanel }}>
            <div className="max-h-36 overflow-y-auto">
              {filtered.length === 0 && !query.trim() && <p className="px-3 py-3 text-xs" style={{ color: "var(--text-3)" }}>No clients yet</p>}
              {filtered.map((c) => (
                <button key={c.id} type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectExisting(c); }}
                  onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left"
                  style={{
                    color: "var(--text-1)",
                    backgroundColor: hovered === c.id ? "color-mix(in srgb, var(--text-1) 6%, transparent)" : "transparent",
                    borderLeft: `2px solid ${hovered === c.id ? "var(--blue)" : "transparent"}`,
                  }}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                    style={{ backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }}>
                    {c.name[0]?.toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{c.name}{c.surname ? ` ${c.surname}` : ""}</span>
                </button>
              ))}
              {query.trim() && !hasExact && (
                <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectCreate(); }}
                  onMouseEnter={() => setHovered("__create__")} onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left"
                  style={{
                    color: "var(--accent)",
                    backgroundColor: hovered === "__create__" ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                    borderTop: filtered.length > 0 ? "1px solid var(--inner-border)" : "none",
                    borderLeft: `2px solid ${hovered === "__create__" ? "var(--accent)" : "transparent"}`,
                  }}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>+</span>
                  <span>Create &ldquo;{query.trim()}&rdquo;</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface Props { currencyCodes: string[]; clients: ClientOption[] }

export default function ExpenseForm({ currencyCodes, clients }: Props) {
  const [state, action, pending] = useActionState(createExpense, null);
  const [currency, setCurrency] = useState("");

  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <form action={action} className="rounded-xl p-5 flex flex-col gap-5"
      style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>

      <p className="text-xs font-medium tracking-widest uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>New expense</p>

      {state?.error && (
        <div className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "var(--red-alert-bg)", border: "1px solid var(--red-alert-border)", color: "var(--red)" }}>
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "var(--green-alert-bg)", border: "1px solid var(--green-alert-border)", color: "var(--accent)" }}>
          Expense added.
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Date & time</span>
          <input name="date" type="datetime-local" required defaultValue={localIso}
            className={inputCls} style={inputStyle} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Amount</span>
          <input name="amount" type="number" step="any" min="0" placeholder="0.00" required
            className={`${inputCls} font-mono`} style={inputStyle} />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Currency</span>
          <CurrencyCombobox value={currency} codes={currencyCodes} onChange={setCurrency} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Account / wallet</span>
          <input name="account" type="text" placeholder="optional"
            className={`${inputCls} text-xs`} style={inputStyle} />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Description</span>
          <input name="comment" type="text" placeholder="What was this for?"
            className={inputCls} style={inputStyle} />
        </label>

        <div className="sm:col-span-2">
          <ClientField clients={clients} />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending}
          className="h-8 rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {pending ? "Adding…" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
