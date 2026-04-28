"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { createManualTransaction } from "./actions";
import type { ClientOption } from "./ClientPicker";

interface Props {
  txTypes: string[];
  currencyCodes: string[];
  clients: ClientOption[];
}

interface Leg {
  amount: string;
  currency: string;
  location: string;
}

// ── Shared input styles ───────────────────────────────────────────────────────

const inputCls = [
  "bg-transparent border-b pb-1 text-sm",
  "outline-none transition-colors focus:border-emerald-500",
].join(" ");
const inputStyle = { borderColor: "var(--inner-border)", color: "var(--text-1)" };

// ── Shared dropdown panel style ───────────────────────────────────────────────

const dropdownPanel: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 color-mix(in srgb, var(--text-1) 5%, transparent)",
  borderRadius: "10px",
  overflow: "hidden",
};

// ── Currency combobox ─────────────────────────────────────────────────────────

function CurrencyCombobox({
  nameAttr,
  value,
  codes,
  onChange,
}: {
  nameAttr: string;
  value: string;
  codes: string[];
  onChange: (v: string) => void;
}) {
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
    <div ref={containerRef} className="relative w-24">
      <input
        name={nameAttr}
        value={value}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key === "Tab") { setOpen(false); return; }
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[0]) { onChange(filtered[0]); setOpen(false); }
          }
        }}
        placeholder="CCY"
        autoComplete="off"
        spellCheck={false}
        className={`${inputCls} w-full font-mono text-xs tracking-wide`}
        style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 z-50 mt-1.5 min-w-[96px]" style={{ top: "100%", ...dropdownPanel }}>
          <div className="max-h-36 overflow-y-auto">
          {filtered.map((c) => {
            const isSelected = c === value;
            const isHovered = c === hovered;
            return (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}
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

// ── Inline client picker ──────────────────────────────────────────────────────

type PendingClient =
  | { mode: "existing"; id: string; name: string; surname: string | null }
  | { mode: "create"; name: string; surname: string | null }
  | null;

function ClientField({ clients }: { clients: ClientOption[] }) {
  const [pending, setPending] = useState<PendingClient>(null);
  const [query, setQuery] = useState("");
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

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) =>
        [c.name, c.surname, c.tgUsername].filter(Boolean).join(" ").toLowerCase().includes(q)
      ).slice(0, 8)
    : clients.slice(0, 8);

  const hasExact = q
    ? clients.some((c) => `${c.name}${c.surname ? " " + c.surname : ""}`.toLowerCase() === q)
    : false;

  function selectExisting(c: ClientOption) {
    setPending({ mode: "existing", id: c.id, name: c.name, surname: c.surname });
    setQuery(`${c.name}${c.surname ? " " + c.surname : ""}`);
    setOpen(false);
  }

  function selectCreate() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/);
    setPending({ mode: "create", name: parts[0], surname: parts.length > 1 ? parts.slice(1).join(" ") : null });
    setOpen(false);
  }

  function clear() { setPending(null); setQuery(""); }

  const displayName = pending ? `${pending.name}${pending.surname ? " " + pending.surname : ""}` : null;

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: "var(--text-3)" }}>Client</span>

      {pending?.mode === "existing" && <input type="hidden" name="client_id" value={pending.id} />}
      {pending?.mode === "create" && (
        <>
          <input type="hidden" name="client_create_name" value={pending.name} />
          {pending.surname && <input type="hidden" name="client_create_surname" value={pending.surname} />}
        </>
      )}

      <div className="relative">
        <div className="flex items-center gap-1">
          <input
            value={query}
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
            placeholder={displayName ?? "Search or type name…"}
            className={`${inputCls} flex-1 text-sm`}
            style={{
              ...inputStyle,
              color: pending ? "var(--accent)" : "var(--text-1)",
            }}
            autoComplete="off"
          />
          {pending && (
            <button type="button" onClick={clear}
              className="shrink-0 text-xs transition-opacity hover:opacity-60"
              style={{ color: "var(--text-3)" }}>×</button>
          )}
        </div>

        {/* Status tag */}
        {pending && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={pending.mode === "existing"
                ? { backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }
                : { backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}
            >
              {pending.mode === "existing" ? "↗" : "+"} {displayName}
            </span>
            {pending.mode === "create" && (
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>will be created</span>
            )}
          </div>
        )}

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 z-50 mt-1.5 w-[240px]" style={{ top: "100%", ...dropdownPanel }}>
            <div className="max-h-36 overflow-y-auto">
              {filtered.length === 0 && !query.trim() && (
                <p className="px-3 py-3 text-xs" style={{ color: "var(--text-3)" }}>No clients yet</p>
              )}
              {filtered.map((c) => {
                const isHov = hovered === c.id;
                return (
                  <button key={c.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectExisting(c); }}
                    onMouseEnter={() => setHovered(c.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                    style={{
                      color: "var(--text-1)",
                      backgroundColor: isHov ? "color-mix(in srgb, var(--text-1) 6%, transparent)" : "transparent",
                      borderLeft: `2px solid ${isHov ? "var(--blue)" : "transparent"}`,
                    }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                      style={{ backgroundColor: "var(--blue-chip-bg)", color: "var(--blue)" }}
                    >
                      {c.name[0]?.toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      {c.name}{c.surname ? ` ${c.surname}` : ""}
                      {c.tgUsername && (
                        <span className="ml-1.5" style={{ color: "var(--text-3)" }}>@{c.tgUsername}</span>
                      )}
                    </span>
                  </button>
                );
              })}

              {query.trim() && !hasExact && (
                <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectCreate(); }}
                  onMouseEnter={() => setHovered("__create__")}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-colors"
                  style={{
                    color: "var(--accent)",
                    backgroundColor: hovered === "__create__" ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                    borderTop: filtered.length > 0 ? "1px solid var(--inner-border)" : "none",
                    borderLeft: `2px solid ${hovered === "__create__" ? "var(--accent)" : "transparent"}`,
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
          </div>
        )}
      </div>
    </div>
  );
}

// ── Leg row ───────────────────────────────────────────────────────────────────

function LegRow({
  direction, leg, index, currencyCodes, onUpdate, onRemove, removable,
}: {
  direction: "in" | "out";
  leg: Leg;
  index: number;
  currencyCodes: string[];
  onUpdate: (i: number, field: keyof Leg, value: string) => void;
  onRemove: (i: number) => void;
  removable: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        name={`${direction}_amount`}
        type="number"
        step="any"
        min="0"
        placeholder="0.00"
        value={leg.amount}
        onChange={(e) => onUpdate(index, "amount", e.target.value)}
        className={`${inputCls} w-28 font-mono`}
        style={inputStyle}
      />
      <CurrencyCombobox
        nameAttr={`${direction}_currency`}
        value={leg.currency}
        codes={currencyCodes}
        onChange={(v) => onUpdate(index, "currency", v)}
      />
      <input
        name={`${direction}_location`}
        type="text"
        placeholder={direction === "in" ? "wallet / account" : "wallet / account"}
        value={leg.location}
        onChange={(e) => onUpdate(index, "location", e.target.value)}
        className={`${inputCls} flex-1 text-xs`}
        style={inputStyle}
      />
      {removable && (
        <button type="button" onClick={() => onRemove(index)}
          className="text-xs px-1 shrink-0 transition-colors hover:opacity-60"
          style={{ color: "var(--text-3)" }}>×</button>
      )}
    </div>
  );
}

// ── Swap icon ─────────────────────────────────────────────────────────────────

const SwapIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M2 4.5h10M10 2l2.5 2.5L10 7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 10.5H3M5 8l-2.5 2.5L5 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Main form ─────────────────────────────────────────────────────────────────

export default function ManualTransactionForm({ txTypes, currencyCodes, clients }: Props) {
  const [state, action, pending] = useActionState(createManualTransaction, null);
  const [inLegs, setInLegs] = useState<Leg[]>([{ amount: "", currency: "", location: "" }]);
  const [outLegs, setOutLegs] = useState<Leg[]>([{ amount: "", currency: "", location: "" }]);

  function updateLeg(legs: Leg[], setLegs: (l: Leg[]) => void, i: number, field: keyof Leg, value: string) {
    const next = [...legs]; next[i] = { ...next[i], [field]: value }; setLegs(next);
  }
  function removeLeg(legs: Leg[], setLegs: (l: Leg[]) => void, i: number) {
    setLegs(legs.filter((_, idx) => idx !== i));
  }
  function handleSwap() {
    const prevIn = inLegs;
    setInLegs(outLegs.map((l) => ({ ...l })));
    setOutLegs(prevIn.map((l) => ({ ...l })));
  }

  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <form action={action} className="rounded-xl p-5 flex flex-col gap-5"
      style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>

      <p className="text-xs font-medium tracking-widest uppercase"
        style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>New transaction</p>

      {state?.error && (
        <div className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "var(--red-alert-bg)", border: "1px solid var(--red-alert-border)", color: "var(--red)" }}>
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "var(--green-alert-bg)", border: "1px solid var(--green-alert-border)", color: "var(--accent)" }}>
          Transaction added.
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Date & time</span>
          <input name="date" type="datetime-local" required defaultValue={localIso}
            className={inputCls} style={inputStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Type</span>
          <select name="transaction_type" className={inputCls}
            style={{ borderColor: "var(--inner-border)", backgroundColor: "transparent", color: "var(--text-1)" }}>
            <option value="">— none —</option>
            {txTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Status</span>
          <select name="status" className={inputCls}
            style={{ borderColor: "var(--inner-border)", backgroundColor: "transparent", color: "var(--text-1)" }}>
            <option value="">— none —</option>
            <option value="done">Done</option>
            <option value="in_process">In process</option>
            <option value="failed">Failed</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Comment</span>
          <input name="comment" type="text" placeholder="optional"
            className={inputCls} style={inputStyle} />
        </label>
        <ClientField clients={clients} />
      </div>

      {/* Legs */}
      <div className="flex items-start gap-3">
        {/* Income */}
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Income</span>
            <button type="button" onClick={() => setInLegs([...inLegs, { amount: "", currency: "", location: "" }])}
              className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--text-3)" }}>+ leg</button>
          </div>
          {inLegs.map((leg, i) => (
            <LegRow key={i} direction="in" leg={leg} index={i} currencyCodes={currencyCodes}
              onUpdate={(idx, f, v) => updateLeg(inLegs, setInLegs, idx, f, v)}
              onRemove={(idx) => removeLeg(inLegs, setInLegs, idx)}
              removable={inLegs.length > 1} />
          ))}
        </div>

        {/* Swap */}
        <div className="flex flex-col items-center shrink-0 pt-6">
          <button type="button" onClick={handleSwap} title="Swap income ↔ outcome"
            className="flex items-center justify-center h-7 w-7 rounded-md transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
            <SwapIcon />
          </button>
        </div>

        {/* Outcome */}
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--red)" }}>Outcome</span>
            <button type="button" onClick={() => setOutLegs([...outLegs, { amount: "", currency: "", location: "" }])}
              className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--text-3)" }}>+ leg</button>
          </div>
          {outLegs.map((leg, i) => (
            <LegRow key={i} direction="out" leg={leg} index={i} currencyCodes={currencyCodes}
              onUpdate={(idx, f, v) => updateLeg(outLegs, setOutLegs, idx, f, v)}
              onRemove={(idx) => removeLeg(outLegs, setOutLegs, idx)}
              removable={outLegs.length > 1} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending}
          className="h-8 rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
          {pending ? "Adding…" : "Add transaction"}
        </button>
        <a href="/app/transactions" className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--text-3)" }}>
          Cancel
        </a>
      </div>
    </form>
  );
}
