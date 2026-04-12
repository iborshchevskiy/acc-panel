"use client";

import { useActionState, useState } from "react";
import { createManualTransaction } from "./actions";

interface Props {
  txTypes: string[];
  currencyCodes: string[];
}

interface Leg {
  amount: string;
  currency: string;
  location: string;
}

const inputCls = [
  "bg-transparent border-b pb-1 text-sm text-slate-200 placeholder:text-slate-700",
  "outline-none transition-colors focus:border-emerald-500",
].join(" ");
const borderStyle = { borderColor: "var(--inner-border)" };
const selectStyle = { borderColor: "var(--inner-border)", backgroundColor: "transparent" };

function LegRow({
  direction,
  leg,
  index,
  currencyCodes,
  onUpdate,
  onRemove,
  removable,
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
        placeholder="Amount"
        value={leg.amount}
        onChange={e => onUpdate(index, "amount", e.target.value)}
        className={`${inputCls} w-28`}
        style={borderStyle}
      />
      <select
        name={`${direction}_currency`}
        value={leg.currency}
        onChange={e => onUpdate(index, "currency", e.target.value)}
        className={`${inputCls} w-24`}
        style={selectStyle}
      >
        <option value="">Currency</option>
        {currencyCodes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input
        name={`${direction}_location`}
        type="text"
        placeholder={direction === "in" ? "to wallet / account" : "from wallet / account"}
        value={leg.location}
        onChange={e => onUpdate(index, "location", e.target.value)}
        className={`${inputCls} flex-1 text-xs`}
        style={borderStyle}
      />
      {removable && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-xs text-slate-600 hover:text-red-400 transition-colors px-1 shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function ManualTransactionForm({ txTypes, currencyCodes }: Props) {
  const [state, action, pending] = useActionState(createManualTransaction, null);
  const [inLegs, setInLegs] = useState<Leg[]>([{ amount: "", currency: "", location: "" }]);
  const [outLegs, setOutLegs] = useState<Leg[]>([{ amount: "", currency: "", location: "" }]);

  function updateLeg(legs: Leg[], setLegs: (l: Leg[]) => void, i: number, field: keyof Leg, value: string) {
    const next = [...legs];
    next[i] = { ...next[i], [field]: value };
    setLegs(next);
  }

  function removeLeg(legs: Leg[], setLegs: (l: Leg[]) => void, i: number) {
    setLegs(legs.filter((_, idx) => idx !== i));
  }

  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  return (
    <form
      action={action}
      className="rounded-xl p-5 flex flex-col gap-5"
      style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}
    >
      <p className="text-xs font-medium tracking-widest uppercase" style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>
        New manual transaction
      </p>

      {/* Feedback */}
      {state?.error && (
        <div className="rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "var(--red-alert-bg)", border: "1px solid var(--red-alert-border)", color: "var(--red)" }}>
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "var(--green-alert-bg)", border: "1px solid var(--green-alert-border)", color: "var(--accent)" }}>
          Transaction added.
        </div>
      )}

      {/* Meta fields */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Date & time</span>
          <input
            name="date"
            type="datetime-local"
            required
            defaultValue={localIso}
            className={inputCls}
            style={borderStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Type</span>
          <select name="transaction_type" className={inputCls} style={selectStyle}>
            <option value="">— none —</option>
            {txTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Comment</span>
          <input
            name="comment"
            type="text"
            placeholder="optional"
            className={inputCls}
            style={borderStyle}
          />
        </label>
      </div>

      {/* Legs */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Income */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Income</span>
            <button type="button" onClick={() => setInLegs([...inLegs, { amount: "", currency: "", location: "" }])}
              className="text-xs text-slate-600 hover:text-emerald-400 transition-colors">
              + add leg
            </button>
          </div>
          <div className="flex gap-2 text-xs text-slate-600 px-0.5">
            <span className="w-28">Amount</span>
            <span className="w-24">Currency</span>
            <span className="flex-1">To (wallet / account)</span>
          </div>
          {inLegs.map((leg, i) => (
            <LegRow key={i} direction="in" leg={leg} index={i} currencyCodes={currencyCodes}
              onUpdate={(idx, field, val) => updateLeg(inLegs, setInLegs, idx, field, val)}
              onRemove={(idx) => removeLeg(inLegs, setInLegs, idx)}
              removable={inLegs.length > 1} />
          ))}
        </div>

        {/* Outcome */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--red)" }}>Outcome</span>
            <button type="button" onClick={() => setOutLegs([...outLegs, { amount: "", currency: "", location: "" }])}
              className="text-xs text-slate-600 hover:text-red-400 transition-colors">
              + add leg
            </button>
          </div>
          <div className="flex gap-2 text-xs text-slate-600 px-0.5">
            <span className="w-28">Amount</span>
            <span className="w-24">Currency</span>
            <span className="flex-1">From (wallet / account)</span>
          </div>
          {outLegs.map((leg, i) => (
            <LegRow key={i} direction="out" leg={leg} index={i} currencyCodes={currencyCodes}
              onUpdate={(idx, field, val) => updateLeg(outLegs, setOutLegs, idx, field, val)}
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
        <a href="/app/transactions" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  );
}
