"use client";

import { useState, useEffect, useCallback } from "react";
import { useLock } from "./LockProvider";
import MatrixKeyLock from "./MatrixKeyLock";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LockIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

export default function LockScreen() {
  const { locked, unlock, unlockDirect, hasPin, hasMatrixKey, getMatrixKeyData } = useLock();

  // Pick default mode when lock appears
  const [mode, setMode] = useState<"pin" | "matrix">("pin");
  useEffect(() => {
    if (locked) setMode(hasMatrixKey ? "matrix" : "pin");
  }, [locked, hasMatrixKey]);

  // ── PIN state ────────────────────────────────────────────────────────────────
  const [pin, setPin]             = useState("");
  const [digits, setDigits]       = useState<number[]>(() => shuffle([1,2,3,4,5,6,7,8,9,0]));
  const [pinError, setPinError]   = useState(false);
  const [pinShaking, setPinShaking] = useState(false);

  useEffect(() => {
    if (locked) { setPin(""); setPinError(false); setDigits(shuffle([1,2,3,4,5,6,7,8,9,0])); }
  }, [locked]);

  useEffect(() => {
    if (pinError) setDigits(shuffle([1,2,3,4,5,6,7,8,9,0]));
  }, [pinError]);

  const pressDigit = useCallback((d: number) => {
    setPin(prev => prev.length >= 8 ? prev : prev + String(d));
  }, []);

  const backspace = useCallback(() => setPin(prev => prev.slice(0, -1)), []);

  // Auto-submit at 4 digits
  useEffect(() => {
    if (mode !== "pin" || pin.length !== 4) return;
    const ok = unlock(pin);
    if (!ok) {
      setPinShaking(true); setPinError(true);
      setTimeout(() => { setPinShaking(false); setPinError(false); setPin(""); }, 600);
    }
  }, [pin, mode, unlock]);

  useEffect(() => {
    if (!locked || mode !== "pin") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") pressDigit(parseInt(e.key));
      else if (e.key === "Backspace") backspace();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [locked, mode, pressDigit, backspace]);

  if (!locked) return null;

  const canToggle   = hasPin && hasMatrixKey;
  const matrixData  = hasMatrixKey ? getMatrixKeyData() : null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center overflow-y-auto py-8"
      style={{ backgroundColor: "var(--bg)", backdropFilter: "blur(24px)" }}
    >
      {/* Dot-grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--text-1) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative flex flex-col items-center gap-5">
        {/* Icon */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
            <LockIcon />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--text-3)" }}>Screen locked</p>
        </div>

        {/* Mode toggle */}
        {canToggle && (
          <div className="flex gap-1 p-1 rounded-lg"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--inner-border)" }}>
            {(["pin", "matrix"] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                style={mode === m
                  ? { backgroundColor: "var(--raised-hi)", color: "var(--text-1)" }
                  : { color: "var(--text-3)" }}>
                {m === "pin" ? "PIN" : "Matrix"}
              </button>
            ))}
          </div>
        )}

        {/* ── PIN pad ────────────────────────────────────────────────────── */}
        {mode === "pin" && (
          <>
            <div className="flex gap-3"
              style={{ animation: pinShaking ? "lockShake 0.6s ease-in-out" : undefined }}>
              {[0,1,2,3].map(i => (
                <div key={i} className="w-3 h-3 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor: pin.length > i ? (pinError ? "var(--red)" : "var(--accent)") : "var(--raised-hi)",
                    border: `1px solid ${pin.length > i ? "transparent" : "var(--border)"}`,
                    transform: pin.length > i ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>

            <p className="text-xs h-4 -mt-1 transition-opacity"
              style={{ color: "var(--red)", opacity: pinError && pin.length === 0 ? 1 : 0 }}>
              Incorrect PIN
            </p>

            <div className="grid grid-cols-3 gap-2.5">
              {digits.slice(0, 9).map(d => (
                <button key={d} type="button" onClick={() => pressDigit(d)}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold transition-all active:scale-95"
                  style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--raised-hi)"; }}>
                  {d}
                </button>
              ))}
              <div />
              <button type="button" onClick={() => pressDigit(digits[9])}
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-semibold transition-all active:scale-95"
                style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--surface)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--raised-hi)"; }}>
                {digits[9]}
              </button>
              <button type="button" onClick={backspace}
                className="flex h-14 w-14 items-center justify-center rounded-2xl transition-all active:scale-95"
                style={{ backgroundColor: "transparent", border: "1px solid transparent", color: "var(--text-3)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--raised-hi)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12H9M9 12l4-4M9 12l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 12l3.5-6H21v12H6.5L3 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {!canToggle && hasMatrixKey && (
              <button type="button" onClick={() => setMode("matrix")}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--text-3)" }}>
                Use matrix instead
              </button>
            )}
          </>
        )}

        {/* ── Matrix pad ─────────────────────────────────────────────────── */}
        {mode === "matrix" && matrixData && (
          <>
            <MatrixKeyLock
              mode="unlock"
              secretNumber={matrixData.secretNumber}
              secretCell={matrixData.secretCell}
              pattern={matrixData.pattern}
              onSuccess={unlockDirect}
            />
            {!canToggle && hasPin && (
              <button type="button" onClick={() => setMode("pin")}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--text-3)" }}>
                Use PIN instead
              </button>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes lockShake {
          0%,100% { transform: translateX(0); }
          15%     { transform: translateX(-8px); }
          30%     { transform: translateX(8px); }
          45%     { transform: translateX(-6px); }
          60%     { transform: translateX(6px); }
          75%     { transform: translateX(-3px); }
          90%     { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
