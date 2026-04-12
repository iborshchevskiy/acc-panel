"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateTransaction } from "./actions";

interface LegData {
  direction: "in" | "out";
  amount: string;
  currency: string;
  location: string;
}

interface Props {
  tx: {
    id: string;
    timestamp: string;
    transactionType: string | null;
    comment: string | null;
  };
  legs: LegData[];
  txTypes: string[];
  currencyCodes: string[];
  cancelHref: string;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = [
  "bg-transparent border-b pb-1 text-sm",
  "outline-none transition-colors focus:border-emerald-500",
].join(" ");
const inputStyle = { borderColor: "var(--inner-border)", color: "var(--text-1)" };

const dropdownPanel: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
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
          {filtered.map((c) => {
            const isSelected = c === value;
            const isHovered = c === hovered;
            return (
              <button key={c} type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}
                onMouseEnter={() => setHovered(c)}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-mono text-left transition-colors"
                style={{
                  color: isSelected ? "var(--accent)" : "var(--text-1)",
                  backgroundColor: isHovered ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                }}
              >
                <span>{c}</span>
                {isSelected && <span style={{ color: "var(--accent)", fontSize: "10px" }}>✓</span>}
              </button>
            );
          })}
        </div>
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

// ── Leg row ───────────────────────────────────────────────────────────────────

function LegRow({
  direction, leg, index, currencyCodes, onUpdate, onRemove, removable,
}: {
  direction: "in" | "out";
  leg: LegData;
  index: number;
  currencyCodes: string[];
  onUpdate: (i: number, field: keyof LegData, value: string) => void;
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
        codes={leg.currency && !currencyCodes.includes(leg.currency)
          ? [leg.currency, ...currencyCodes]
          : currencyCodes}
        onChange={(v) => onUpdate(index, "currency", v)}
      />
      <input
        name={`${direction}_location`}
        type="text"
        placeholder="wallet / account"
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalIso(isoStr: string): string {
  const d = new Date(isoStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ── Edit form ─────────────────────────────────────────────────────────────────

export default function EditTransactionForm({ tx, legs, txTypes, currencyCodes, cancelHref }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateTransaction, null);

  const initialIn = legs.filter((l) => l.direction === "in");
  const initialOut = legs.filter((l) => l.direction === "out");

  const [inLegs, setInLegs] = useState<LegData[]>(
    initialIn.length > 0 ? initialIn : [{ direction: "in", amount: "", currency: "", location: "" }]
  );
  const [outLegs, setOutLegs] = useState<LegData[]>(
    initialOut.length > 0 ? initialOut : [{ direction: "out", amount: "", currency: "", location: "" }]
  );

  function handleSwap() {
    const prevIn = inLegs;
    setInLegs(outLegs.map((l) => ({ ...l, direction: "in" as const })));
    setOutLegs(prevIn.map((l) => ({ ...l, direction: "out" as const })));
  }

  useEffect(() => {
    if (state?.success) router.push(cancelHref);
  }, [state?.success, cancelHref, router]);

  function updateLeg(list: LegData[], setList: (l: LegData[]) => void, i: number, field: keyof LegData, value: string) {
    const next = [...list]; next[i] = { ...next[i], [field]: value }; setList(next);
  }
  function removeLeg(list: LegData[], setList: (l: LegData[]) => void, i: number) {
    setList(list.filter((_, idx) => idx !== i));
  }

  return (
    <form action={action} className="rounded-xl p-5 flex flex-col gap-5"
      style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-widest uppercase"
          style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>Edit transaction</p>
        <a href={cancelHref} className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--text-3)" }}>
          Cancel
        </a>
      </div>

      <input type="hidden" name="tx_id" value={tx.id} />

      {state?.error && (
        <div className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "var(--red-alert-bg)", border: "1px solid var(--red-alert-border)", color: "var(--red)" }}>
          {state.error}
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Date & time</span>
          <input name="date" type="datetime-local" required defaultValue={toLocalIso(tx.timestamp)}
            className={inputCls} style={inputStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Type</span>
          <select name="transaction_type" defaultValue={tx.transactionType ?? ""} className={inputCls}
            style={{ borderColor: "var(--inner-border)", backgroundColor: "transparent", color: "var(--text-1)" }}>
            <option value="">— none —</option>
            {txTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Comment</span>
          <input name="comment" type="text" placeholder="optional" defaultValue={tx.comment ?? ""}
            className={inputCls} style={inputStyle} />
        </label>
      </div>

      {/* Legs */}
      <div className="flex items-start gap-3">
        {/* Income */}
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Income</span>
            <button type="button" onClick={() => setInLegs([...inLegs, { direction: "in", amount: "", currency: "", location: "" }])}
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
            <button type="button" onClick={() => setOutLegs([...outLegs, { direction: "out", amount: "", currency: "", location: "" }])}
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
          {pending ? "Saving…" : "Save changes"}
        </button>
        <a href={cancelHref} className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--text-3)" }}>
          Cancel
        </a>
      </div>
    </form>
  );
}
