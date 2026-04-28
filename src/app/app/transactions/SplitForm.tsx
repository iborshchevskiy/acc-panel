"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { splitTransaction } from "./actions";
import { type ClientOption } from "./ClientPicker";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface OriginalLeg {
  direction: string; // 'in' | 'out' | 'fee'
  amount: string | null;
  currency: string | null;
  location: string | null;
}

interface PartLeg {
  direction: "in" | "out" | "fee";
  amount: string;
  currency: string;
  location: string;
}

interface PartState {
  transactionType: string;
  status: string;
  comment: string;
  clientId: string | null;
  clientLabel: string | null; // for display only
  legs: PartLeg[];
}

interface Props {
  txId: string;
  originalLegs: OriginalLeg[];
  txTypes: string[];
  currencyCodes: string[];
  orgClients: ClientOption[];
  onCancel: () => void;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function dirLabel(d: string) {
  return d === "in" ? "Income" : d === "out" ? "Outcome" : "Fee";
}
function dirColor(d: string) {
  return d === "in" ? "var(--accent)" : d === "out" ? "var(--red)" : "var(--violet)";
}

/** Tolerant amount parser — accepts "1234.56", "1234,56", "1 234.56", "1.234,56".
 *  We strip thousand separators heuristically; the LAST `,` or `.` is treated
 *  as the decimal mark.  Empty / non-numeric → NaN. */
function parseAmount(raw: string): number {
  if (!raw) return NaN;
  const s = raw.replace(/\s/g, "");
  // Find the rightmost separator and treat it as decimal.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized = s;
  if (lastComma > lastDot) {
    // Comma is the decimal mark; remove dots (thousand separators), swap comma → dot.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Dot is the decimal mark; remove commas (thousand separators).
    normalized = s.replace(/,/g, "");
  } else {
    // No separators; strip any thousand-style commas just in case.
    normalized = s.replace(/,/g, "");
  }
  return Number(normalized);
}

/** Build a Map<key=`${dir}|${ccyUpper}`, totalAmount>. */
function totalsByDirCcy(legs: { direction: string; amount: string | null; currency: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of legs) {
    const a = l.amount ? parseAmount(l.amount) : 0;
    if (!l.currency || !Number.isFinite(a) || a === 0) continue;
    const k = `${l.direction}|${l.currency.toUpperCase()}`;
    m.set(k, (m.get(k) ?? 0) + a);
  }
  return m;
}

/* ── Main ───────────────────────────────────────────────────────────────── */

export default function SplitForm({
  txId, originalLegs, txTypes, currencyCodes, orgClients, onCancel,
}: Props) {
  const [state, action, pending] = useActionState(splitTransaction, null);

  // Derive original totals once — anchors the "remaining" math.
  const originalTotals = useMemo(() => totalsByDirCcy(originalLegs), [originalLegs]);

  // Distinct (dir, ccy) buckets the user must allocate. Also used to
  // pre-populate each new part with empty leg slots that match the original's
  // shape — fewer clicks for the common case.
  const buckets = useMemo(() => {
    const seen = new Set<string>();
    const out: { direction: "in" | "out" | "fee"; currency: string }[] = [];
    for (const l of originalLegs) {
      if (!l.currency || !l.amount) continue;
      const k = `${l.direction}|${l.currency.toUpperCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ direction: l.direction as "in" | "out" | "fee", currency: l.currency.toUpperCase() });
    }
    return out;
  }, [originalLegs]);

  function emptyPart(): PartState {
    return {
      transactionType: "",
      status: "",
      comment: "",
      clientId: null,
      clientLabel: null,
      legs: buckets.map(b => ({ direction: b.direction, amount: "", currency: b.currency, location: "" })),
    };
  }

  const [parts, setParts] = useState<PartState[]>([emptyPart(), emptyPart()]);

  function setPart(i: number, fn: (p: PartState) => PartState) {
    setParts(parts.map((p, idx) => (idx === i ? fn(p) : p)));
  }
  function addPart() { setParts([...parts, emptyPart()]); }
  function removePart(i: number) {
    if (parts.length <= 2) return;
    setParts(parts.filter((_, idx) => idx !== i));
  }
  function addLeg(i: number, direction: "in" | "out" | "fee") {
    setPart(i, p => ({ ...p, legs: [...p.legs, { direction, amount: "", currency: "", location: "" }] }));
  }
  function updateLeg(pi: number, li: number, field: keyof PartLeg, value: string) {
    setPart(pi, p => ({
      ...p,
      legs: p.legs.map((l, idx) => idx === li ? { ...l, [field]: field === "currency" ? value.toUpperCase() : value } : l),
    }));
  }
  function removeLeg(pi: number, li: number) {
    setPart(pi, p => ({ ...p, legs: p.legs.filter((_, idx) => idx !== li) }));
  }

  // ── Live "remaining" per (dir, ccy) ──────────────────────────────────────
  const allocated = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parts) {
      for (const l of p.legs) {
        const a = parseAmount(l.amount);
        if (!l.currency || !Number.isFinite(a) || a === 0) continue;
        const k = `${l.direction}|${l.currency.toUpperCase()}`;
        m.set(k, (m.get(k) ?? 0) + a);
      }
    }
    return m;
  }, [parts]);

  const allocationRows = useMemo(() => {
    // Union of original keys + any new keys the user introduced (e.g.
    // splitting a USDT-only outflow but also adding a fee leg).
    const keys = new Set([...originalTotals.keys(), ...allocated.keys()]);
    return Array.from(keys).map(k => {
      const [dir, ccy] = k.split("|");
      const target = originalTotals.get(k) ?? 0;
      const have = allocated.get(k) ?? 0;
      const diff = Math.abs(target - have) < 1e-9 ? 0 : target - have;
      return { dir, ccy, target, have, remaining: diff };
    }).sort((a, b) => {
      const order: Record<string, number> = { in: 0, out: 1, fee: 2 };
      return (order[a.dir] ?? 9) - (order[b.dir] ?? 9) || a.ccy.localeCompare(b.ccy);
    });
  }, [originalTotals, allocated]);

  // Balanced when EVERY (dir, ccy) bucket has remaining ≈ 0. Both the
  // original buckets (target > 0) and any new buckets the user introduced
  // (target = 0, must net to 0 too) are checked the same way.
  const unbalancedRows = allocationRows.filter(r => Math.abs(r.remaining) >= 1e-9);
  const allBalanced = allocationRows.length > 0 && unbalancedRows.length === 0;

  // Close form on success
  useEffect(() => { if (state?.success) onCancel(); }, [state?.success, onCancel]);

  // Build the JSON payload — server expects normalized decimal-dot amounts.
  const partsJson = useMemo(() => JSON.stringify(parts.map(p => ({
    transactionType: p.transactionType || null,
    status: p.status || null,
    comment: p.comment || null,
    clientId: p.clientId,
    legs: p.legs
      .filter(l => {
        const a = parseAmount(l.amount);
        return l.currency && Number.isFinite(a) && a !== 0;
      })
      .map(l => ({
        direction: l.direction,
        amount: String(parseAmount(l.amount)), // normalized "123.45"
        currency: l.currency.toUpperCase(),
        location: l.location || null,
      })),
  }))), [parts]);

  return (
    <form
      action={action}
      className="flex flex-col gap-5 px-4 py-4"
      style={{ borderLeft: "2px solid var(--amber)", backgroundColor: "var(--raised-hi)" }}
    >
      <input type="hidden" name="tx_id" value={txId} />
      <input type="hidden" name="parts_json" value={partsJson} />

      {/* Header + remaining indicator */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--amber)" }}>
            Split transaction
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-3)" }}>
            One on-chain payment, multiple business meanings. Allocate every leg
            of the original across {parts.length} parts, then apply.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2 rounded-md px-3 py-2"
          style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}
        >
          {allocationRows.map(r => (
            <span key={`${r.dir}|${r.ccy}`} className="flex flex-col items-end leading-tight">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: dirColor(r.dir) }}>
                {dirLabel(r.dir)} {r.ccy}
              </span>
              <span
                className="text-[12px] font-mono tabular-nums"
                style={{
                  color: Math.abs(r.remaining) < 1e-9 ? "var(--accent)" : "var(--amber)",
                }}
              >
                {Math.abs(r.remaining) < 1e-9 ? "✓ allocated" : `${r.remaining.toLocaleString(undefined, { maximumFractionDigits: 8 })} left`}
              </span>
            </span>
          ))}
        </div>
      </div>

      {state?.error && (
        <p className="text-xs px-2 py-1 rounded"
          style={{ backgroundColor: "var(--red-alert-bg)", color: "var(--red)", border: "1px solid var(--red-alert-border)" }}>
          {state.error}
        </p>
      )}

      {/* Parts */}
      <div className="flex flex-col gap-3">
        {parts.map((p, pi) => (
          <PartCard
            key={pi}
            index={pi}
            total={parts.length}
            part={p}
            txTypes={txTypes}
            currencyCodes={currencyCodes}
            orgClients={orgClients}
            onChange={fn => setPart(pi, fn)}
            onRemove={() => removePart(pi)}
            onAddLeg={(dir) => addLeg(pi, dir)}
            onUpdateLeg={(li, field, value) => updateLeg(pi, li, field, value)}
            onRemoveLeg={(li) => removeLeg(pi, li)}
          />
        ))}
      </div>

      {/* Inline diagnostic — explicitly tells the user why Apply is disabled. */}
      {!allBalanced && unbalancedRows.length > 0 && (
        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{
            backgroundColor: "color-mix(in srgb, var(--amber) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--amber) 28%, transparent)",
            color: "var(--text-2)",
          }}
        >
          <span style={{ color: "var(--amber)", fontWeight: 600 }}>
            Not balanced yet ·{" "}
          </span>
          {unbalancedRows.map((r, i) => {
            const sign = r.remaining > 0 ? "still need" : "over by";
            const amt = Math.abs(r.remaining).toLocaleString(undefined, { maximumFractionDigits: 8 });
            return (
              <span key={`${r.dir}|${r.ccy}`}>
                {i > 0 && ", "}
                <span style={{ color: dirColor(r.dir), fontWeight: 500 }}>{dirLabel(r.dir)} {r.ccy}</span>
                <span style={{ color: "var(--text-3)" }}>: {sign} </span>
                <span className="font-mono tabular-nums">{amt}</span>
              </span>
            );
          })}
          <p className="mt-1" style={{ color: "var(--text-4)" }}>
            Total per (direction, currency) across all parts must equal the original transaction.
            Decimal commas are accepted (1234,56 = 1234.56).
          </p>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={addPart}
          className="text-xs h-7 px-3 rounded transition-opacity hover:opacity-80"
          style={{ color: "var(--text-2)", border: "1px solid var(--inner-border)" }}
        >
          + Add part
        </button>
        <span className="flex-1" />
        <button
          type="submit"
          disabled={pending || !allBalanced}
          className="h-7 rounded px-4 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}
          title={allBalanced ? "Split now" : "Allocate all amounts before applying"}
        >
          {pending ? "Splitting…" : `Apply split · ${parts.length} parts`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs transition-opacity hover:opacity-60"
          style={{ color: "var(--text-3)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Per-part card ──────────────────────────────────────────────────────── */

function PartCard({
  index, total, part, txTypes, currencyCodes, orgClients,
  onChange, onRemove, onAddLeg, onUpdateLeg, onRemoveLeg,
}: {
  index: number;
  total: number;
  part: PartState;
  txTypes: string[];
  currencyCodes: string[];
  orgClients: ClientOption[];
  onChange: (fn: (p: PartState) => PartState) => void;
  onRemove: () => void;
  onAddLeg: (direction: "in" | "out" | "fee") => void;
  onUpdateLeg: (li: number, field: keyof PartLeg, value: string) => void;
  onRemoveLeg: (li: number) => void;
}) {
  const inLegs = part.legs.map((l, i) => ({ leg: l, i })).filter(x => x.leg.direction === "in");
  const outLegs = part.legs.map((l, i) => ({ leg: l, i })).filter(x => x.leg.direction === "out");
  const feeLegs = part.legs.map((l, i) => ({ leg: l, i })).filter(x => x.leg.direction === "fee");

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold"
          style={{ background: "color-mix(in srgb, var(--amber) 18%, transparent)", color: "var(--amber)" }}
        >
          {index + 1}
        </span>
        <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
          Part {index + 1}
        </span>
        {total > 2 && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--text-3)" }}
          >
            Remove
          </button>
        )}
      </div>

      {/* Meta: type / client / status / comment */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Type</span>
          <select
            value={part.transactionType}
            onChange={(e) => onChange(p => ({ ...p, transactionType: e.target.value }))}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          >
            <option value="">— none —</option>
            {txTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Client</span>
          <SplitClientField
            clients={orgClients}
            selected={part.clientId ? { id: part.clientId, label: part.clientLabel ?? "" } : null}
            onSelect={(c) => onChange(p => ({ ...p, clientId: c?.id ?? null, clientLabel: c ? `${c.name}${c.surname ? " " + c.surname : ""}` : null }))}
          />
        </div>

        <label className="flex flex-col gap-1 min-w-[120px]">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Status</span>
          <select
            value={part.status}
            onChange={(e) => onChange(p => ({ ...p, status: e.target.value }))}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          >
            <option value="">— none —</option>
            <option value="done">Done</option>
            <option value="in_process">In process</option>
            <option value="failed">Failed</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Comment</span>
          <input
            type="text"
            placeholder="optional"
            value={part.comment}
            onChange={(e) => onChange(p => ({ ...p, comment: e.target.value }))}
            className="bg-transparent border-b pb-1 text-sm outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          />
        </label>
      </div>

      {/* Legs */}
      <div className="flex items-start gap-3 mt-1">
        <LegColumn
          label="Income" color="var(--accent)"
          legs={inLegs} currencyCodes={currencyCodes}
          onAdd={() => onAddLeg("in")}
          onUpdate={onUpdateLeg}
          onRemove={onRemoveLeg}
        />
        <LegColumn
          label="Outcome" color="var(--red)"
          legs={outLegs} currencyCodes={currencyCodes}
          onAdd={() => onAddLeg("out")}
          onUpdate={onUpdateLeg}
          onRemove={onRemoveLeg}
        />
        {(feeLegs.length > 0) ? (
          <LegColumn
            label="Fee" color="var(--violet)"
            legs={feeLegs} currencyCodes={currencyCodes}
            onAdd={() => onAddLeg("fee")}
            onUpdate={onUpdateLeg}
            onRemove={onRemoveLeg}
          />
        ) : (
          <button
            type="button"
            onClick={() => onAddLeg("fee")}
            className="self-end mb-1 text-[10px] transition-opacity hover:opacity-70"
            style={{ color: "var(--text-4)" }}
          >
            + fee leg
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Leg column (mirrors ManualTransactionForm column) ────────────────── */

function LegColumn({
  label, color, legs, currencyCodes, onAdd, onUpdate, onRemove,
}: {
  label: string;
  color: string;
  legs: { leg: PartLeg; i: number }[];
  currencyCodes: string[];
  onAdd: () => void;
  onUpdate: (li: number, field: keyof PartLeg, value: string) => void;
  onRemove: (li: number) => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color }}>{label}</span>
        <button type="button" onClick={onAdd}
          className="text-[10px] transition-opacity hover:opacity-70" style={{ color: "var(--text-3)" }}>+ leg</button>
      </div>
      {legs.length === 0 && (
        <span className="text-[11px] italic" style={{ color: "var(--text-4)" }}>none</span>
      )}
      {legs.map(({ leg, i }) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text" inputMode="decimal" placeholder="0.00"
            value={leg.amount}
            onChange={(e) => onUpdate(i, "amount", e.target.value)}
            className="w-24 bg-transparent border-b pb-1 text-sm font-mono outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          />
          <input
            type="text"
            placeholder="CCY"
            value={leg.currency}
            onChange={(e) => onUpdate(i, "currency", e.target.value)}
            list={`split-ccys-${label}`}
            className="w-20 bg-transparent border-b pb-1 text-sm font-mono uppercase outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          />
          <input
            type="text" placeholder="wallet / account"
            value={leg.location}
            onChange={(e) => onUpdate(i, "location", e.target.value)}
            className="flex-1 bg-transparent border-b pb-1 text-xs outline-none focus:border-emerald-500"
            style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="text-xs px-1 shrink-0 hover:opacity-60"
            style={{ color: "var(--text-3)" }}
          >×</button>
        </div>
      ))}
      {/* Shared datalist for currency hints */}
      <datalist id={`split-ccys-${label}`}>
        {currencyCodes.map(c => <option key={c} value={c} />)}
      </datalist>
    </div>
  );
}

/* ── Compact client picker for split parts ────────────────────────────── */

function SplitClientField({
  clients, selected, onSelect,
}: {
  clients: ClientOption[];
  selected: { id: string; label: string } | null;
  onSelect: (c: ClientOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter(c => {
        const full = [c.name, c.surname, c.tgUsername].filter(Boolean).join(" ").toLowerCase();
        return full.includes(q);
      }).slice(0, 6)
    : clients.slice(0, 6);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs"
          style={{
            background: "var(--blue-chip-bg, color-mix(in srgb, var(--blue) 14%, transparent))",
            color: "var(--blue)",
            border: "1px solid color-mix(in srgb, var(--blue) 18%, transparent)",
          }}
        >
          {selected.label || "selected"}
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-[10px] transition-opacity hover:opacity-70"
          style={{ color: "var(--text-3)" }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="search…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="bg-transparent border-b pb-1 text-sm outline-none w-full focus:border-emerald-500"
        style={{ borderColor: "var(--inner-border)", color: "var(--text-1)" }}
      />
      {open && filtered.length > 0 && (
        <div
          className="absolute left-0 top-full mt-1 z-20 w-56 rounded-md overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-hi)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.52)",
          }}
        >
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(c); setQuery(""); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors"
              style={{ color: "var(--text-1)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in srgb, var(--text-1) 6%, transparent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: "var(--blue-chip-bg, color-mix(in srgb, var(--blue) 14%, transparent))", color: "var(--blue)" }}
              >
                {c.name[0]?.toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 truncate">
                {c.name}{c.surname ? ` ${c.surname}` : ""}
              </span>
              {c.tgUsername && <span className="text-[10px]" style={{ color: "var(--text-3)" }}>@{c.tgUsername}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
