"use client";

import { useState, useTransition, useRef, useEffect, useActionState, useCallback, Fragment } from "react";
import ClientPicker, { type ClientOption } from "./ClientPicker";
import { deleteTransaction, bulkSetType, bulkAssignClient, bulkDelete, bulkSetStatus, updateTransaction, setTransactionStatus, setTransactionType, updateLeg, createLeg } from "./actions";
import { trimTrailingZeros } from "@/lib/format";

export interface TxRow {
  id: string;
  timestamp: string;
  transactionType: string | null;
  type: string;
  txHash: string | null;
  comment: string | null;
  status: string | null;
  isMatched: boolean;
}

export interface LegRow {
  id: string;
  transactionId: string;
  direction: string;
  amount: string | null;
  currency: string | null;
  location: string | null;
}

interface Props {
  rows: TxRow[];
  legs: LegRow[];
  clientByTx: Record<string, ClientOption>;
  txTypes: string[];
  orgClients: ClientOption[];
  currencyCodes: string[];
}

const TX_TYPE_COLORS: Record<string, string> = {
  Exchange: "var(--indigo)",
  Revenue: "var(--accent)",
  Expense: "var(--red)",
  Debt: "var(--amber)",
  Transfer: "var(--text-2)",
  Fee: "var(--violet)",
};

type TxStatus = "done" | "in_process" | "failed" | "unknown";

const STATUS_CONFIG: Record<TxStatus, { label: string; color: string }> = {
  done:       { label: "Done",       color: "var(--accent)" },
  in_process: { label: "In process", color: "var(--amber)"  },
  failed:     { label: "Failed",     color: "var(--red)"    },
  unknown:    { label: "Unknown",    color: "var(--text-3)" },
};

const STATUS_OPTIONS: TxStatus[] = ["done", "in_process", "failed", "unknown"];

const dropdownPanel: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
  borderRadius: "10px",
  overflow: "hidden",
};

// ── Type picker for bulk bar ──────────────────────────────────────────────────

function BulkTypePicker({ txTypes, onSelect }: { txTypes: string[]; onSelect: (t: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 flex items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-2)" }}
      >
        Set type
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M1.5 3l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 z-50 w-44" style={dropdownPanel}>
          <div className="max-h-36 overflow-y-auto">
            {txTypes.map((t) => {
              const color = TX_TYPE_COLORS[t] ?? "var(--text-2)";
              return (
                <button key={t} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onSelect(t); setOpen(false); }}
                  onMouseEnter={() => setHovered(t)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors"
                  style={{
                    backgroundColor: hovered === t ? "rgba(255,255,255,0.05)" : "transparent",
                    borderLeft: `2px solid ${hovered === t ? color : "transparent"}`,
                    color: "var(--text-1)",
                  }}
                >
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: color + "22", color }}>
                    {t}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid var(--inner-border)" }}>
            <button type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(null); setOpen(false); }}
              onMouseEnter={() => setHovered("__clear__")}
              onMouseLeave={() => setHovered(null)}
              className="flex items-center w-full px-3 py-2 text-xs text-left"
              style={{
                backgroundColor: hovered === "__clear__" ? "rgba(255,255,255,0.05)" : "transparent",
                borderLeft: "2px solid transparent",
                color: "var(--text-3)",
              }}
            >
              Clear type
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Client picker for bulk bar ────────────────────────────────────────────────

function BulkClientPicker({ clients, onSelect }: { clients: ClientOption[]; onSelect: (clientId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) => [c.name, c.surname, c.tgUsername].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 6)
    : clients.slice(0, 6);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="h-7 flex items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        Assign client
      </button>
      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 z-50 w-52" style={dropdownPanel}>
          <div className="p-2">
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client…"
              className="w-full rounded px-2 py-1.5 text-xs outline-none"
              style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-1)" }}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
            />
          </div>
          <div className="max-h-36 overflow-y-auto">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: "var(--text-3)" }}>No clients found</p>}
            {filtered.map((c) => (
              <button key={c.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(c.id); setOpen(false); setQuery(""); }}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left"
                style={{
                  backgroundColor: hovered === c.id ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: `2px solid ${hovered === c.id ? "var(--blue)" : "transparent"}`,
                  color: "var(--text-1)",
                }}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }}>
                  {c.name[0]?.toUpperCase()}
                </span>
                <span className="truncate">{c.name}{c.surname ? ` ${c.surname}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status picker for bulk bar ────────────────────────────────────────────────

function BulkStatusPicker({ onSelect }: { onSelect: (s: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="h-7 flex items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        Set status
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M1.5 3l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 z-50 w-40" style={dropdownPanel}>
          <div className="py-1">
            {STATUS_OPTIONS.map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <button key={s} type="button"
                  onMouseDown={(e) => { e.preventDefault(); onSelect(s); setOpen(false); }}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors"
                  style={{
                    backgroundColor: hovered === s ? "rgba(255,255,255,0.05)" : "transparent",
                    borderLeft: `2px solid ${hovered === s ? cfg.color : "transparent"}`,
                    color: "var(--text-1)",
                  }}>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: cfg.color + "22", color: cfg.color }}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid var(--inner-border)" }}>
            <button type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(null); setOpen(false); }}
              onMouseEnter={() => setHovered("__clear__")}
              onMouseLeave={() => setHovered(null)}
              className="flex items-center w-full px-3 py-2 text-xs text-left"
              style={{
                backgroundColor: hovered === "__clear__" ? "rgba(255,255,255,0.05)" : "transparent",
                borderLeft: "2px solid transparent",
                color: "var(--text-3)",
              }}>
              Clear status
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline status picker (cell-level) ────────────────────────────────────────

function StatusPicker({ txId, current }: { txId: string; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState(current);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function pick(status: string | null) {
    setOptimistic(status);
    setOpen(false);
    await setTransactionStatus(txId, status);
  }

  const cfg = optimistic ? STATUS_CONFIG[optimistic as TxStatus] : null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="group flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
        style={{ backgroundColor: open ? "rgba(255,255,255,0.05)" : "transparent" }}
        title="Change status">
        {cfg ? (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: cfg.color + "22", color: cfg.color }}>
            {cfg.label}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>—</span>
        )}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
          className="opacity-0 group-hover:opacity-40 transition-opacity shrink-0"
          style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-36" style={{
          top: "100%",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border-hi)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <div className="py-1">
            {STATUS_OPTIONS.map((s) => {
              const c = STATUS_CONFIG[s];
              return (
                <button key={s} type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
                  style={{
                    backgroundColor: hovered === s ? "rgba(255,255,255,0.05)" : "transparent",
                    borderLeft: `2px solid ${hovered === s ? c.color : "transparent"}`,
                  }}>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: c.color + "22", color: c.color }}>
                    {c.label}
                  </span>
                  {optimistic === s && <span className="ml-auto text-[9px]" style={{ color: c.color }}>✓</span>}
                </button>
              );
            })}
          </div>
          {optimistic && (
            <div style={{ borderTop: "1px solid var(--inner-border)" }}>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(null); }}
                onMouseEnter={() => setHovered("__clear__")}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center w-full px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: hovered === "__clear__" ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: "2px solid transparent",
                  color: "var(--text-3)",
                }}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline type picker ────────────────────────────────────────────────────────

function TypePicker({ txId, current, txTypes }: { txId: string; current: string | null; txTypes: string[] }) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState(current);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function pick(type: string | null) {
    setOptimistic(type);
    setOpen(false);
    await setTransactionType(txId, type);
  }

  const color = optimistic ? (TX_TYPE_COLORS[optimistic] ?? "var(--text-2)") : null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="group flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
        style={{ backgroundColor: open ? "rgba(255,255,255,0.05)" : "transparent" }}
        title="Change type">
        {optimistic && color ? (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: color + "22", color }}>
            {optimistic}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>—</span>
        )}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
          className="opacity-0 group-hover:opacity-40 transition-opacity shrink-0"
          style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-36" style={{
          top: "100%",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border-hi)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <div className="py-1">
            {txTypes.map((t) => {
              const c = TX_TYPE_COLORS[t] ?? "var(--text-2)";
              return (
                <button key={t} type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(t); }}
                  onMouseEnter={() => setHovered(t)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left"
                  style={{
                    backgroundColor: hovered === t ? "rgba(255,255,255,0.05)" : "transparent",
                    borderLeft: `2px solid ${hovered === t ? c : "transparent"}`,
                  }}>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: c + "22", color: c }}>
                    {t}
                  </span>
                  {optimistic === t && <span className="ml-auto text-[9px]" style={{ color: c }}>✓</span>}
                </button>
              );
            })}
          </div>
          {optimistic && (
            <div style={{ borderTop: "1px solid var(--inner-border)" }}>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(null); }}
                onMouseEnter={() => setHovered("__clear__")}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center w-full px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: hovered === "__clear__" ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: "2px solid transparent",
                  color: "var(--text-3)",
                }}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline currency combobox ──────────────────────────────────────────────────

function CurrencyCombobox({ nameAttr, value, codes, onChange }: {
  nameAttr: string; value: string; codes: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const q = value.toUpperCase();
  const filtered = q.length > 0
    ? codes.filter((c) => c.startsWith(q) || c.includes(q)).slice(0, 8)
    : codes.slice(0, 8);

  return (
    <div ref={ref} className="relative w-20">
      <input name={nameAttr} value={value}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key === "Tab") { setOpen(false); return; }
          if (e.key === "Enter") { e.preventDefault(); if (filtered[0]) { onChange(filtered[0]); setOpen(false); } }
        }}
        placeholder="currency" autoComplete="off" spellCheck={false}
        className="w-full bg-transparent border-b pb-1 text-xs font-mono outline-none transition-colors focus:border-emerald-500"
        style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 z-50 mt-1 min-w-[80px]"
          style={{ top: "100%", backgroundColor: "var(--surface)", border: "1px solid var(--border-hi)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.52)", borderRadius: 10, overflow: "hidden" }}>
          <div className="max-h-28 overflow-y-auto">
            {filtered.map((c) => (
              <button key={c} type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}
                onMouseEnter={() => setHovered(c)} onMouseLeave={() => setHovered(null)}
                className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-mono text-left"
                style={{
                  color: c === value ? "var(--accent)" : "var(--text-1)",
                  backgroundColor: hovered === c ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: `2px solid ${c === value ? "var(--accent)" : "transparent"}`,
                }}>
                {c}{c === value && <span style={{ color: "var(--accent)", fontSize: 9 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline leg editor (single leg) ───────────────────────────────────────────

function InlineLegEditor({ leg, txId, direction, readonly, currencyCodes, onSaved }: {
  leg: LegRow | undefined;
  txId: string;
  direction: "in" | "out";
  readonly: boolean;
  currencyCodes: string[];
  onSaved?: () => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [amount, setAmount]     = useState(trimTrailingZeros(leg?.amount));
  const [currency, setCurrency] = useState(leg?.currency ?? "");
  const [location, setLocation] = useState(leg?.location ?? "");
  const [saving, setSaving]     = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) amountRef.current?.focus(); }, [editing]);

  useEffect(() => {
    if (!editing) {
      setAmount(trimTrailingZeros(leg?.amount));
      setCurrency(leg?.currency ?? "");
      setLocation(leg?.location ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg?.id, leg?.amount, leg?.currency, leg?.location]);

  async function save() {
    setSaving(true);
    if (leg) {
      await updateLeg(leg.id, amount, currency, location);
    } else {
      await createLeg(txId, direction, amount, currency, location);
    }
    setSaving(false);
    setEditing(false);
    onSaved?.();
  }

  function cancel() {
    setAmount(trimTrailingZeros(leg?.amount));
    setCurrency(leg?.currency ?? "");
    setLocation(leg?.location ?? "");
    setEditing(false);
    onSaved?.();
  }

  const color = direction === "in" ? "var(--accent)" : "var(--red)";
  const sign  = direction === "in" ? "+" : "−";
  const codes = currency && !currencyCodes.includes(currency) ? [currency, ...currencyCodes] : currencyCodes;

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 py-0.5">
        <div className="flex items-center gap-1.5">
          <input
            ref={amountRef}
            type="text" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") cancel(); }}
            placeholder="0.00"
            className="w-20 bg-transparent border-b pb-0.5 text-xs font-mono outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          />
          <CurrencyCombobox nameAttr={`_${direction}_currency`} value={currency} codes={codes} onChange={setCurrency} />
        </div>
        <input
          type="text" value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") cancel(); }}
          placeholder="wallet / account"
          className="w-full bg-transparent border-b pb-0.5 text-xs outline-none focus:border-emerald-500"
          style={{ borderColor: "var(--inner-border)", color: "var(--text-3)" }}
        />
        <div className="flex items-center gap-3 mt-0.5">
          <button type="button" onClick={save} disabled={saving}
            className="text-[10px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ color: "var(--accent)" }}>
            {saving ? "…" : "Save"}
          </button>
          <button type="button" onClick={cancel}
            className="text-[10px] transition-opacity hover:opacity-60"
            style={{ color: "var(--text-3)" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const hasValue = !!amount;

  if (readonly) {
    return (
      <div>
        <span className="text-xs font-mono" style={{ color: hasValue ? color : "var(--text-3)" }}>
          {hasValue ? <>{sign}{Number(amount).toLocaleString()} <span style={{ opacity: 0.7 }}>{currency}</span></> : "—"}
        </span>
        {location && (
          <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-4)" }}>
            {location.length > 14 ? `${location.slice(0, 6)}…${location.slice(-4)}` : location}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group w-full text-left rounded px-1 py-0.5 -mx-1 transition-colors hover:bg-white/5"
      title={leg ? "Click to edit" : "Click to add"}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono" style={{ color: hasValue ? color : "var(--text-3)" }}>
          {hasValue
            ? <>{sign}{Number(amount).toLocaleString()} <span style={{ opacity: 0.65 }}>{currency}</span></>
            : "—"}
        </span>
        {!hasValue && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
            className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
            style={{ color: "var(--accent)" }}>
            <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L4 10l-3 1 1-3 6.5-6.5z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      {location && (
        <div className="text-[10px] font-mono mt-0.5 truncate max-w-[140px]" style={{ color: "var(--text-4)" }}>
          {location.length > 16 ? `${location.slice(0, 7)}…${location.slice(-5)}` : location}
        </div>
      )}
    </button>
  );
}

// ── Leg stack — shows ALL legs for one direction ──────────────────────────────

function LegStack({ legs, direction, txId, currencyCodes }: {
  legs: LegRow[];
  direction: "in" | "out";
  txId: string;
  currencyCodes: string[];
}) {
  const [addingNew, setAddingNew] = useState(false);
  const color = direction === "in" ? "var(--accent)" : "var(--red)";
  const isMulti = legs.length > 1 || (legs.length === 1 && addingNew);

  if (legs.length === 0 && !addingNew) {
    return (
      <InlineLegEditor
        leg={undefined} txId={txId} direction={direction}
        readonly={false} currencyCodes={currencyCodes}
      />
    );
  }

  return (
    <div
      className="flex flex-col"
      style={isMulti ? {
        paddingLeft: "7px",
        borderLeft: `1.5px solid ${color}`,
        gap: 0,
        opacity: 1,
      } : undefined}
    >
      {legs.map((leg, i) => (
        <Fragment key={leg.id}>
          {i > 0 && (
            <div style={{ height: 1, margin: "3px 0", backgroundColor: "var(--inner-border)", opacity: 0.5 }} />
          )}
          <InlineLegEditor
            leg={leg} txId={txId} direction={direction}
            readonly={false} currencyCodes={currencyCodes}
          />
        </Fragment>
      ))}

      {addingNew && (
        <>
          <div style={{ height: 1, margin: "3px 0", backgroundColor: "var(--inner-border)", opacity: 0.5 }} />
          <InlineLegEditor
            leg={undefined} txId={txId} direction={direction}
            readonly={false} currencyCodes={currencyCodes}
            onSaved={() => setAddingNew(false)}
          />
        </>
      )}

      {!addingNew && (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="mt-1 text-left text-[9px] transition-opacity hover:opacity-80"
          style={{ color: "var(--text-4)", opacity: 0.4 }}
        >
          + leg
        </button>
      )}
    </div>
  );
}

// ── Inline edit form (renders inside a table row) ─────────────────────────────

interface EditLeg { amount: string; currency: string; location: string; }

function InlineEditForm({ tx, legRows, txTypes, currencyCodes, onClose }: {
  tx: TxRow;
  legRows: LegRow[];
  txTypes: string[];
  currencyCodes: string[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateTransaction, null);

  const toLocalIso = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const mkLeg = (dir: "in" | "out"): EditLeg[] => {
    const rows = legRows.filter((l) => l.direction === dir);
    return rows.length > 0
      ? rows.map((l) => ({ amount: l.amount ?? "", currency: l.currency ?? "", location: l.location ?? "" }))
      : [{ amount: "", currency: "", location: "" }];
  };

  const [inLegs,  setInLegs]  = useState<EditLeg[]>(() => mkLeg("in"));
  const [outLegs, setOutLegs] = useState<EditLeg[]>(() => mkLeg("out"));

  useEffect(() => { if (state?.success) onClose(); }, [state?.success, onClose]);

  function updLeg(list: EditLeg[], set: (l: EditLeg[]) => void, i: number, f: keyof EditLeg, v: string) {
    const next = [...list]; next[i] = { ...next[i], [f]: v }; set(next);
  }
  function remLeg(list: EditLeg[], set: (l: EditLeg[]) => void, i: number) {
    set(list.filter((_, idx) => idx !== i));
  }

  const allCodes = (leg: EditLeg) =>
    leg.currency && !currencyCodes.includes(leg.currency)
      ? [leg.currency, ...currencyCodes] : currencyCodes;

  return (
    <form action={action} className="flex flex-col gap-4 px-4 py-4"
      style={{ borderLeft: "2px solid var(--accent)", backgroundColor: "var(--raised-hi)" }}>
      <input type="hidden" name="tx_id" value={tx.id} />

      {state?.error && (
        <p className="text-xs px-2 py-1 rounded"
          style={{ backgroundColor: "var(--red-alert-bg)", color: "var(--red)", border: "1px solid var(--red-alert-border)" }}>
          {state.error}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Date & time</span>
          <input name="date" type="datetime-local" required defaultValue={toLocalIso(tx.timestamp)}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Type</span>
          <select name="transaction_type" defaultValue={tx.transactionType ?? ""}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}>
            <option value="">— none —</option>
            {txTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Status</span>
          <select name="status" defaultValue={tx.status ?? ""}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}>
            <option value="">— none —</option>
            <option value="done">Done</option>
            <option value="in_process">In process</option>
            <option value="failed">Failed</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-48">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>TxID / Hash</span>
          <input name="tx_hash" type="text" placeholder="optional" defaultValue={tx.txHash ?? ""}
            className="bg-transparent border-b pb-1 text-sm font-mono outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-32">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Comment</span>
          <input name="comment" type="text" placeholder="optional" defaultValue={tx.comment ?? ""}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
        </label>
      </div>

      {/* Legs */}
      <div className="flex items-start gap-3">
        {/* Income */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--accent)" }}>Income</span>
            <button type="button" onClick={() => setInLegs([...inLegs, { amount: "", currency: "", location: "" }])}
              className="text-[10px] transition-opacity hover:opacity-70" style={{ color: "var(--text-3)" }}>+ leg</button>
          </div>
          {inLegs.map((leg, i) => (
            <div key={i} className="flex items-center gap-2">
              <input name="in_amount" type="text" inputMode="decimal" placeholder="0.00"
                value={trimTrailingZeros(leg.amount)} onChange={(e) => updLeg(inLegs, setInLegs, i, "amount", e.target.value)}
                className="w-24 bg-transparent border-b pb-1 text-sm font-mono outline-none focus:border-emerald-500"
                style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
              <CurrencyCombobox nameAttr="in_currency" value={leg.currency} codes={allCodes(leg)}
                onChange={(v) => updLeg(inLegs, setInLegs, i, "currency", v)} />
              <input name="in_location" type="text" placeholder="wallet / account"
                value={leg.location} onChange={(e) => updLeg(inLegs, setInLegs, i, "location", e.target.value)}
                className="flex-1 bg-transparent border-b pb-1 text-xs outline-none focus:border-emerald-500"
                style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
              {inLegs.length > 1 && (
                <button type="button" onClick={() => remLeg(inLegs, setInLegs, i)}
                  className="text-xs px-1 shrink-0 hover:opacity-60" style={{ color: "var(--text-3)" }}>×</button>
              )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="shrink-0 pt-5 flex flex-col items-center">
          <button type="button" title="Swap income ↔ outcome"
            onClick={() => { const p = inLegs; setInLegs(outLegs.map(l=>({...l}))); setOutLegs(p.map(l=>({...l}))); }}
            className="flex h-6 w-6 items-center justify-center rounded transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none">
              <path d="M2 4.5h10M10 2l2.5 2.5L10 7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 10.5H3M5 8l-2.5 2.5L5 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Outcome */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--red)" }}>Outcome</span>
            <button type="button" onClick={() => setOutLegs([...outLegs, { amount: "", currency: "", location: "" }])}
              className="text-[10px] transition-opacity hover:opacity-70" style={{ color: "var(--text-3)" }}>+ leg</button>
          </div>
          {outLegs.map((leg, i) => (
            <div key={i} className="flex items-center gap-2">
              <input name="out_amount" type="text" inputMode="decimal" placeholder="0.00"
                value={trimTrailingZeros(leg.amount)} onChange={(e) => updLeg(outLegs, setOutLegs, i, "amount", e.target.value)}
                className="w-24 bg-transparent border-b pb-1 text-sm font-mono outline-none focus:border-emerald-500"
                style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
              <CurrencyCombobox nameAttr="out_currency" value={leg.currency} codes={allCodes(leg)}
                onChange={(v) => updLeg(outLegs, setOutLegs, i, "currency", v)} />
              <input name="out_location" type="text" placeholder="wallet / account"
                value={leg.location} onChange={(e) => updLeg(outLegs, setOutLegs, i, "location", e.target.value)}
                className="flex-1 bg-transparent border-b pb-1 text-xs outline-none focus:border-emerald-500"
                style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }} />
              {outLegs.length > 1 && (
                <button type="button" onClick={() => remLeg(outLegs, setOutLegs, i)}
                  className="text-xs px-1 shrink-0 hover:opacity-60" style={{ color: "var(--text-3)" }}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending}
          className="h-7 rounded px-4 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onClose}
          className="text-xs transition-opacity hover:opacity-60" style={{ color: "var(--text-3)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Unmatched indicator ───────────────────────────────────────────────────────

function ReviewBadge() {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="relative flex shrink-0" style={{ width: 7, height: 7 }}>
        <span className="animate-ping absolute inset-0 rounded-full opacity-60"
          style={{ backgroundColor: "var(--amber)" }} />
        <span className="relative rounded-full"
          style={{ width: 7, height: 7, backgroundColor: "var(--amber)", display: "block" }} />
      </span>
      <span className="text-[10px] font-semibold tracking-wide uppercase"
        style={{ color: "var(--amber)", letterSpacing: "0.04em" }}>
        Review
      </span>
    </div>
  );
}

// ── Exchange rate helpers ─────────────────────────────────────────────────────

function fmtExRate(outAmt: number, outCur: string, inAmt: number, inCur: string): string | null {
  if (!outAmt || !inAmt || inCur === outCur || !inCur || !outCur) return null;
  const rate = outAmt / inAmt; // outCur per inCur
  if (rate >= 1) {
    return `${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${outCur}/${inCur}`;
  }
  return `${(1 / rate).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${inCur}/${outCur}`;
}

/** Returns one rate string per paired leg. Handles 1:1 and N:N; returns [] otherwise. */
function calcRates(inLegs: LegRow[], outLegs: LegRow[]): string[] {
  const ins  = inLegs.filter(l  => l.amount && parseFloat(l.amount)  > 0 && l.currency);
  const outs = outLegs.filter(l => l.amount && parseFloat(l.amount) > 0 && l.currency);
  if (ins.length === 0 || outs.length === 0) return [];
  if (ins.length === 1 && outs.length === 1) {
    const r = fmtExRate(parseFloat(outs[0].amount!), outs[0].currency!, parseFloat(ins[0].amount!), ins[0].currency!);
    return r ? [r] : [];
  }
  if (ins.length === outs.length) {
    return ins.flatMap((il, i) => {
      const r = fmtExRate(parseFloat(outs[i].amount!), outs[i].currency!, parseFloat(il.amount!), il.currency!);
      return r ? [r] : [];
    });
  }
  return [];
}

// ── Main table ────────────────────────────────────────────────────────────────

export default function TransactionTable({
  rows, legs, clientByTx, txTypes, orgClients, currencyCodes,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const closeEdit = useCallback(() => setEditingId(null), []);

  // Build legsByTx map
  const legsByTx = new Map<string, LegRow[]>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkType(type: string | null) {
    startTransition(async () => {
      await bulkSetType([...selected], type);
      setSelected(new Set());
    });
  }

  function handleBulkClient(clientId: string) {
    startTransition(async () => {
      await bulkAssignClient([...selected], clientId);
      setSelected(new Set());
    });
  }

  function handleBulkStatus(status: string | null) {
    startTransition(async () => {
      await bulkSetStatus([...selected], status);
      setSelected(new Set());
    });
  }

  function handleBulkDelete() {
    if (!window.confirm(`Delete ${selected.size} transaction${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    startTransition(async () => {
      await bulkDelete([...selected]);
      setSelected(new Set());
    });
  }

  return (
    <div className="relative">
      <div
        className="overflow-x-auto"
        style={{
          // iPad/PWA: let the user pan the wide table horizontally instead of
          // clipping columns. overscroll-behavior contains the scroll so the
          // page doesn't bounce when the user reaches the edge.
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <table className="w-full text-sm" style={{ minWidth: 1100 }}>
          <thead>
            <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
              <th className="px-3 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll}
                  className="rounded"
                  style={{ accentColor: "var(--accent)", cursor: "pointer", width: "13px", height: "13px" }}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">In</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Out</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">TxID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Client</th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((tx, i) => {
              const txLegs = legsByTx.get(tx.id) ?? [];
              const inLegs  = txLegs.filter((l) => l.direction === "in");
              const outLegs = txLegs.filter((l) => l.direction === "out");
              const isLast = i === rows.length - 1;
              const isEditing = editingId === tx.id;
              const isChecked = selected.has(tx.id);
              const explorerUrl = tx.txHash ? `https://tronscan.org/#/transaction/${tx.txHash}` : null;

              return (
                <Fragment key={tx.id}>
                <tr style={{
                  backgroundColor: isChecked
                    ? "rgba(16,185,129,0.04)"
                    : isEditing ? "var(--raised-hi)" : "var(--surface)",
                  borderBottom: isEditing ? "none" : isLast ? "none" : "1px solid var(--inner-border)",
                  opacity: isPending && isChecked ? 0.5 : 1,
                  transition: "background-color 0.1s, opacity 0.15s",
                  verticalAlign: "top",
                }}>
                  <td className="px-3 pt-3">
                    <input type="checkbox" checked={isChecked} onChange={() => toggleRow(tx.id)}
                      style={{ accentColor: "var(--accent)", cursor: "pointer", width: "13px", height: "13px" }}
                    />
                  </td>
                  <td className="px-4 pt-3 pb-3 whitespace-nowrap">
                    <div className="text-xs text-slate-400">
                      {new Date(tx.timestamp).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
                    </div>
                    <button
                      type="button"
                      title={tx.id}
                      onClick={() => navigator.clipboard.writeText(tx.id)}
                      className="text-[10px] font-mono text-slate-700 hover:text-slate-500 transition-colors mt-0.5 block"
                    >
                      {tx.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-4 pt-3 pb-3">
                    {tx.type === "Trade" && (!tx.transactionType || !txTypes.includes(tx.transactionType)) && !tx.status && !clientByTx[tx.id] && <ReviewBadge />}
                    <TypePicker txId={tx.id} current={tx.transactionType} txTypes={txTypes} />
                  </td>
                  <td className="px-4 pt-3 pb-3">
                    <StatusPicker txId={tx.id} current={tx.status} />
                  </td>
                  <td className="px-4 pt-3 pb-3">
                    <LegStack legs={inLegs} direction="in" txId={tx.id} currencyCodes={currencyCodes} />
                  </td>
                  <td className="px-4 pt-3 pb-3">
                    <LegStack legs={outLegs} direction="out" txId={tx.id} currencyCodes={currencyCodes} />
                  </td>
                  <td className="px-4 pt-3 pb-3">
                    {(() => {
                      const rates = calcRates(inLegs, outLegs);
                      if (rates.length === 0) return <span className="text-xs font-mono" style={{ color: "var(--text-4)" }}>—</span>;
                      return (
                        <div className="flex flex-col gap-1">
                          {rates.map((r, i) => (
                            <span key={i} className="text-xs font-mono whitespace-nowrap" style={{ color: "var(--text-3)" }}>{r}</span>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 pt-3 pb-3 text-xs font-mono text-slate-600">
                    {explorerUrl && tx.txHash ? (
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                        className="hover:text-emerald-400 transition-colors" title={tx.txHash}>
                        {tx.txHash.slice(0, 8)}…
                      </a>
                    ) : <span className="text-slate-700">manual</span>}
                  </td>
                  <td className="px-4 pt-3 pb-3">
                    <ClientPicker txId={tx.id} current={clientByTx[tx.id] ?? null} clients={orgClients} />
                  </td>
                  <td className="px-4 pt-3 pb-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button"
                        onClick={() => setEditingId(isEditing ? null : tx.id)}
                        className="text-xs transition-colors"
                        style={{ color: isEditing ? "var(--accent)" : "var(--text-3)" }}
                        title={isEditing ? "Close editor" : "Edit transaction"}>
                        {isEditing ? "✕" : "edit"}
                      </button>
                      <form action={deleteTransaction}>
                        <input type="hidden" name="tx_id" value={tx.id} />
                        <button type="submit" className="text-xs text-slate-700 hover:text-red-400 transition-colors">×</button>
                      </form>
                    </div>
                  </td>
                </tr>
                {isEditing && (
                  <tr>
                    <td colSpan={10} style={{
                      padding: 0,
                      borderBottom: isLast ? "none" : "1px solid var(--inner-border)",
                    }}>
                      <InlineEditForm
                        tx={tx}
                        legRows={legsByTx.get(tx.id) ?? []}
                        txTypes={txTypes}
                        currencyCodes={currencyCodes}
                        onClose={closeEdit}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border-hi)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {/* Count */}
          <span className="text-xs font-medium tabular-nums pr-2 mr-1"
            style={{ color: "var(--accent)", borderRight: "1px solid var(--inner-border)" }}>
            {selected.size} selected
          </span>

          <BulkTypePicker txTypes={txTypes} onSelect={handleBulkType} />
          <BulkStatusPicker onSelect={handleBulkStatus} />
          <BulkClientPicker clients={orgClients} onSelect={handleBulkClient} />

          {/* Delete */}
          <button type="button" onClick={handleBulkDelete} disabled={isPending}
            className="h-7 flex items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--red)" }}>
            Delete
          </button>

          {/* Dismiss */}
          <button type="button" onClick={() => setSelected(new Set())} disabled={isPending}
            className="ml-1 text-xs transition-opacity hover:opacity-60 disabled:opacity-30"
            style={{ color: "var(--text-3)" }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
