"use client";

import { useState } from "react";
import { useLock } from "@/components/LockProvider";
import MatrixKeyLock from "@/components/MatrixKeyLock";
import type { MatrixKeyData } from "@/components/LockProvider";

const AUTOLOCK_OPTIONS = [
  { value: 0,  label: "Never" },
  { value: 1,  label: "1 minute" },
  { value: 5,  label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
];

const inputCls = "bg-transparent border-b pb-1 text-sm outline-none transition-colors focus:border-emerald-500 text-slate-200 placeholder:text-slate-700";
const inputStyle = { borderColor: "var(--inner-border)" };

type PinMode    = "idle" | "set" | "change" | "disable";
type MatrixMode = "idle" | "set" | "change" | "disable";

export default function SecurityTab() {
  const {
    hasPin, setPin, clearPin,
    hasMatrixKey, setMatrixKey, clearMatrixKey,
    autolockMinutes, setAutolockMinutes,
  } = useLock();

  const [success, setSuccess] = useState("");

  // ── PIN ─────────────────────────────────────────────────────────────────────
  const [pinMode, setPinMode] = useState<PinMode>("idle");
  const [pin1, setPin1]       = useState("");
  const [pin2, setPin2]       = useState("");
  const [pinErr, setPinErr]   = useState("");

  function resetPin() { setPinMode("idle"); setPin1(""); setPin2(""); setPinErr(""); }

  function handleSavePin() {
    setPinErr("");
    if (pin1.length < 4)        { setPinErr("PIN must be at least 4 digits."); return; }
    if (!/^\d+$/.test(pin1))    { setPinErr("PIN must contain digits only."); return; }
    if (pin1 !== pin2)           { setPinErr("PINs do not match."); return; }
    setPin(pin1);
    showSuccess("PIN saved. Screen lock is now active.");
    resetPin();
  }

  function handleDisablePin() { clearPin(); showSuccess("PIN removed."); resetPin(); }

  // ── Matrix key ──────────────────────────────────────────────────────────────
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("idle");

  function handleSaveMatrix(data: MatrixKeyData) {
    setMatrixKey(data);
    showSuccess(`Matrix key saved — digit ${data.secretNumber} at col ${data.secretCell.x}, row ${data.secretCell.y}.`);
    setMatrixMode("idle");
  }

  function handleDisableMatrix() {
    clearMatrixKey();
    showSuccess("Matrix key removed.");
    setMatrixMode("idle");
  }

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3500);
  }

  const hasAnyLock = hasPin || hasMatrixKey;

  return (
    <div className="flex flex-col gap-10">

      {success && (
        <div className="rounded-md px-3 py-2 text-xs"
          style={{ backgroundColor: "var(--green-alert-bg)", border: "1px solid var(--green-alert-border)", color: "var(--accent)" }}>
          {success}
        </div>
      )}

      {/* ── PIN ─────────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium tracking-widest uppercase mb-4"
          style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>Screen lock PIN</p>

        <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-4)" }}>
          Lock with{" "}
          <kbd className="rounded px-1 py-0.5 text-[10px] font-mono"
            style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)" }}>⌘L</kbd>{" "}
          or{" "}
          <kbd className="rounded px-1 py-0.5 text-[10px] font-mono"
            style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)" }}>Ctrl+L</kbd>.
          Shuffled numpad — shoulder-surf proof.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: hasPin ? "var(--accent)" : "var(--text-3)" }} />
            <span className="text-xs" style={{ color: hasPin ? "var(--accent)" : "var(--text-3)" }}>
              {hasPin ? "PIN active" : "No PIN set"}
            </span>
          </div>
          {!hasPin && pinMode === "idle" && (
            <button type="button" onClick={() => setPinMode("set")}
              className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
              Set PIN
            </button>
          )}
          {hasPin && pinMode === "idle" && (
            <>
              <button type="button" onClick={() => setPinMode("change")}
                className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--raised-hi)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                Change PIN
              </button>
              <button type="button" onClick={() => setPinMode("disable")}
                className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" }}>
                Remove
              </button>
            </>
          )}
        </div>

        {(pinMode === "set" || pinMode === "change") && (
          <div className="flex flex-col gap-4 max-w-xs">
            {pinErr && <p className="text-xs" style={{ color: "var(--red)" }}>{pinErr}</p>}
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--text-4)" }}>
                {pinMode === "change" ? "New PIN" : "PIN"} (digits only, min 4)
              </span>
              <input type="password" inputMode="numeric" pattern="[0-9]*"
                value={pin1} onChange={e => setPin1(e.target.value.replace(/\D/g, ""))}
                maxLength={8} placeholder="••••" className={inputCls} style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--text-4)" }}>Confirm PIN</span>
              <input type="password" inputMode="numeric" pattern="[0-9]*"
                value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ""))}
                maxLength={8} placeholder="••••" className={inputCls} style={inputStyle}
                onKeyDown={e => { if (e.key === "Enter") handleSavePin(); }} />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={handleSavePin}
                className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
                Save
              </button>
              <button type="button" onClick={resetPin}
                className="text-xs transition-opacity hover:opacity-60"
                style={{ color: "var(--text-3)" }}>Cancel</button>
            </div>
          </div>
        )}

        {pinMode === "disable" && (
          <div className="flex flex-col gap-3 max-w-xs">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Remove the PIN and disable PIN lock?</p>
            <div className="flex gap-3">
              <button type="button" onClick={handleDisablePin}
                className="h-7 rounded px-3 text-xs font-medium"
                style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" }}>
                Remove PIN
              </button>
              <button type="button" onClick={resetPin}
                className="text-xs transition-opacity hover:opacity-60"
                style={{ color: "var(--text-3)" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Matrix key ──────────────────────────────────────────────────────── */}
      <div className="pt-8 border-t" style={{ borderColor: "var(--surface-lo)" }}>
        <p className="text-xs font-medium tracking-widest uppercase mb-4"
          style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>Matrix key</p>

        <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-4)" }}>
          An infinite scrolling number grid. Slide it until your secret digit lands on your secret
          cell, then release. Position and digit are both required — invisible to shoulder-surfers.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: hasMatrixKey ? "var(--accent)" : "var(--text-3)" }} />
            <span className="text-xs" style={{ color: hasMatrixKey ? "var(--accent)" : "var(--text-3)" }}>
              {hasMatrixKey ? "Matrix key active" : "No matrix key set"}
            </span>
          </div>
          {!hasMatrixKey && matrixMode === "idle" && (
            <button type="button" onClick={() => setMatrixMode("set")}
              className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
              Set matrix key
            </button>
          )}
          {hasMatrixKey && matrixMode === "idle" && (
            <>
              <button type="button" onClick={() => setMatrixMode("change")}
                className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--raised-hi)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                Change
              </button>
              <button type="button" onClick={() => setMatrixMode("disable")}
                className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" }}>
                Remove
              </button>
            </>
          )}
        </div>

        {(matrixMode === "set" || matrixMode === "change") && (
          <MatrixKeyLock
            mode="setup"
            onSave={handleSaveMatrix}
            onCancel={() => setMatrixMode("idle")}
          />
        )}

        {matrixMode === "disable" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Remove the matrix key?</p>
            <div className="flex gap-3">
              <button type="button" onClick={handleDisableMatrix}
                className="h-7 rounded px-3 text-xs font-medium"
                style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.2)" }}>
                Remove matrix key
              </button>
              <button type="button" onClick={() => setMatrixMode("idle")}
                className="text-xs transition-opacity hover:opacity-60"
                style={{ color: "var(--text-3)" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Autolock ────────────────────────────────────────────────────────── */}
      <div className="pt-8 border-t" style={{ borderColor: "var(--surface-lo)" }}>
        <p className="text-xs font-medium tracking-widest uppercase mb-4"
          style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>Auto-lock on inactivity</p>
        <p className="text-xs mb-5" style={{ color: "var(--text-4)" }}>
          Automatically lock after a period of inactivity. Requires a PIN or matrix key.
        </p>
        <div className="flex flex-wrap gap-2">
          {AUTOLOCK_OPTIONS.map(opt => (
            <button key={opt.value} type="button"
              disabled={!hasAnyLock && opt.value !== 0}
              onClick={() => setAutolockMinutes(opt.value)}
              className="h-7 rounded px-3 text-xs font-medium transition-all disabled:opacity-30"
              style={autolockMinutes === opt.value
                ? { backgroundColor: "var(--accent)", color: "var(--surface)" }
                : { backgroundColor: "var(--raised-hi)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
              {opt.label}
            </button>
          ))}
        </div>
        {!hasAnyLock && (
          <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>
            Set a PIN or matrix key first to enable auto-lock.
          </p>
        )}
      </div>

    </div>
  );
}
