"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

// ── types (exported so consumers can import) ──────────────────────────────────
export interface MatrixKeyData {
  secretNumber: number;
  secretCell: { x: number; y: number };
  pattern: number[][];
}

interface LockContextValue {
  locked: boolean;
  hasPin: boolean;
  hasMatrixKey: boolean;
  lock: () => void;
  unlock: (pin: string) => boolean;
  unlockDirect: () => void;            // called by MatrixKeyLock on success
  setPin: (pin: string) => void;
  clearPin: () => void;
  setMatrixKey: (data: MatrixKeyData) => void;
  clearMatrixKey: () => void;
  getMatrixKeyData: () => MatrixKeyData | null;
  autolockMinutes: number;
  setAutolockMinutes: (n: number) => void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used inside LockProvider");
  return ctx;
}

// ── cyrb53 hash — no crypto.subtle needed, works on HTTP / LAN ───────────────
function hashData(input: string): string {
  const s = "accpanel-lock-v2:" + input;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

// ── localStorage keys ─────────────────────────────────────────────────────────
const PIN_KEY        = "acc-lock-pin-hash";
const MATRIX_KEY     = "acc-lock-matrix-key";   // stores MatrixKeyData as JSON
const AUTOLOCK_KEY   = "acc-lock-autolock";

// ── provider ──────────────────────────────────────────────────────────────────
export default function LockProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLocked]           = useState(false);
  const [hasPin, setHasPin]           = useState(false);
  const [hasMatrixKey, setHasMatrixKey] = useState(false);
  const [autolockMinutes, setAutolockMinutesState] = useState(0);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHasPin(!!localStorage.getItem(PIN_KEY));
    setHasMatrixKey(!!localStorage.getItem(MATRIX_KEY));
    const al = parseInt(localStorage.getItem(AUTOLOCK_KEY) ?? "0");
    setAutolockMinutesState(isNaN(al) ? 0 : al);
  }, []);

  // Cmd/Ctrl+L shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        const hasLock = !!localStorage.getItem(PIN_KEY) || !!localStorage.getItem(MATRIX_KEY);
        if (hasLock) setLocked(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    const al = parseInt(localStorage.getItem(AUTOLOCK_KEY) ?? "0");
    if (!al || al <= 0) return;
    inactivityTimer.current = setTimeout(() => {
      const hasLock = !!localStorage.getItem(PIN_KEY) || !!localStorage.getItem(MATRIX_KEY);
      if (hasLock) setLocked(true);
    }, al * 60 * 1000);
  }, []);

  useEffect(() => {
    if (autolockMinutes <= 0) {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      return;
    }
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => document.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [autolockMinutes, resetTimer]);

  const lock = useCallback(() => {
    const hasLock = !!localStorage.getItem(PIN_KEY) || !!localStorage.getItem(MATRIX_KEY);
    if (hasLock) setLocked(true);
  }, []);

  const unlock = useCallback((pin: string): boolean => {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) { setLocked(false); return true; }
    if (hashData(pin) === stored) { setLocked(false); resetTimer(); return true; }
    return false;
  }, [resetTimer]);

  const unlockDirect = useCallback(() => {
    setLocked(false);
    resetTimer();
  }, [resetTimer]);

  const setPin = useCallback((pin: string) => {
    localStorage.setItem(PIN_KEY, hashData(pin));
    setHasPin(true);
  }, []);

  const clearPin = useCallback(() => {
    localStorage.removeItem(PIN_KEY);
    setHasPin(false);
    if (!localStorage.getItem(MATRIX_KEY)) setLocked(false);
  }, []);

  const setMatrixKey = useCallback((data: MatrixKeyData) => {
    localStorage.setItem(MATRIX_KEY, JSON.stringify(data));
    setHasMatrixKey(true);
  }, []);

  const clearMatrixKey = useCallback(() => {
    localStorage.removeItem(MATRIX_KEY);
    // also clean up legacy keys from old mechanic
    localStorage.removeItem("acc-lock-matrix-hash");
    localStorage.removeItem("acc-lock-matrix-size");
    setHasMatrixKey(false);
    if (!localStorage.getItem(PIN_KEY)) setLocked(false);
  }, []);

  const getMatrixKeyData = useCallback((): MatrixKeyData | null => {
    try {
      const raw = localStorage.getItem(MATRIX_KEY);
      return raw ? (JSON.parse(raw) as MatrixKeyData) : null;
    } catch { return null; }
  }, []);

  const setAutolockMinutes = useCallback((n: number) => {
    localStorage.setItem(AUTOLOCK_KEY, String(n));
    setAutolockMinutesState(n);
  }, []);

  return (
    <LockContext.Provider value={{
      locked, hasPin, hasMatrixKey,
      lock, unlock, unlockDirect,
      setPin, clearPin,
      setMatrixKey, clearMatrixKey, getMatrixKeyData,
      autolockMinutes, setAutolockMinutes,
    }}>
      {children}
    </LockContext.Provider>
  );
}
