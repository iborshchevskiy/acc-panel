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

// ── localStorage keys (used as a fast cache only) ─────────────────────────────
const PIN_KEY        = "acc-lock-pin-hash";
const MATRIX_KEY     = "acc-lock-matrix-key";
const AUTOLOCK_KEY   = "acc-lock-autolock";

interface ServerSettings {
  pinHash: string | null;
  matrixKey: MatrixKeyData | null;
  autolockMinutes: number;
}

async function fetchSettings(): Promise<ServerSettings | null> {
  try {
    const r = await fetch("/api/lock-settings", { credentials: "same-origin" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function pushSettings(patch: Partial<ServerSettings>): Promise<void> {
  try {
    await fetch("/api/lock-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(patch),
    });
  } catch { /* fire-and-forget; cache stays in localStorage */ }
}

// ── provider ──────────────────────────────────────────────────────────────────
export default function LockProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLocked]                       = useState(false);
  const [pinHash, setPinHashState]                = useState<string | null>(null);
  const [matrixKey, setMatrixKeyState]            = useState<MatrixKeyData | null>(null);
  const [autolockMinutes, setAutolockMinutesState] = useState(0);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate: localStorage first (instant), then DB (authoritative) ─────────
  useEffect(() => {
    // 1. Synchronous read from localStorage so the lock is "ready" on first paint
    const lsPin    = localStorage.getItem(PIN_KEY);
    const lsMatrix = localStorage.getItem(MATRIX_KEY);
    const lsAutol  = parseInt(localStorage.getItem(AUTOLOCK_KEY) ?? "0");
    if (lsPin) setPinHashState(lsPin);
    if (lsMatrix) {
      try { setMatrixKeyState(JSON.parse(lsMatrix) as MatrixKeyData); } catch { /* bad cache */ }
    }
    if (!isNaN(lsAutol)) setAutolockMinutesState(lsAutol);

    // 2. Async fetch from server. Server wins; if server is empty but we have
    //    localStorage data, push it up (one-time migration for existing users).
    (async () => {
      const server = await fetchSettings();
      if (!server) return; // unauthenticated or offline; keep ls cache
      const localOnly = (lsPin || lsMatrix) && !server.pinHash && !server.matrixKey;
      if (localOnly) {
        await pushSettings({
          pinHash: lsPin,
          matrixKey: lsMatrix ? (JSON.parse(lsMatrix) as MatrixKeyData) : null,
          autolockMinutes: isNaN(lsAutol) ? 0 : lsAutol,
        });
        return; // already matches local state
      }
      // Server has data — sync into local state + cache
      setPinHashState(server.pinHash);
      setMatrixKeyState(server.matrixKey);
      setAutolockMinutesState(server.autolockMinutes ?? 0);
      if (server.pinHash) localStorage.setItem(PIN_KEY, server.pinHash);
      else localStorage.removeItem(PIN_KEY);
      if (server.matrixKey) localStorage.setItem(MATRIX_KEY, JSON.stringify(server.matrixKey));
      else localStorage.removeItem(MATRIX_KEY);
      localStorage.setItem(AUTOLOCK_KEY, String(server.autolockMinutes ?? 0));
    })();
  }, []);

  const hasPin       = !!pinHash;
  const hasMatrixKey = !!matrixKey;

  // Cmd/Ctrl+L shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        if (hasPin || hasMatrixKey) setLocked(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [hasPin, hasMatrixKey]);

  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (autolockMinutes <= 0) return;
    inactivityTimer.current = setTimeout(() => {
      if (hasPin || hasMatrixKey) setLocked(true);
    }, autolockMinutes * 60 * 1000);
  }, [autolockMinutes, hasPin, hasMatrixKey]);

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
    if (hasPin || hasMatrixKey) setLocked(true);
  }, [hasPin, hasMatrixKey]);

  const unlock = useCallback((pin: string): boolean => {
    if (!pinHash) { setLocked(false); return true; }
    if (hashData(pin) === pinHash) { setLocked(false); resetTimer(); return true; }
    return false;
  }, [pinHash, resetTimer]);

  const unlockDirect = useCallback(() => {
    setLocked(false);
    resetTimer();
  }, [resetTimer]);

  const setPin = useCallback((pin: string) => {
    const h = hashData(pin);
    localStorage.setItem(PIN_KEY, h);
    setPinHashState(h);
    void pushSettings({ pinHash: h });
  }, []);

  const clearPin = useCallback(() => {
    localStorage.removeItem(PIN_KEY);
    setPinHashState(null);
    if (!matrixKey) setLocked(false);
    void pushSettings({ pinHash: null });
  }, [matrixKey]);

  const setMatrixKey = useCallback((data: MatrixKeyData) => {
    localStorage.setItem(MATRIX_KEY, JSON.stringify(data));
    setMatrixKeyState(data);
    void pushSettings({ matrixKey: data });
  }, []);

  const clearMatrixKey = useCallback(() => {
    localStorage.removeItem(MATRIX_KEY);
    localStorage.removeItem("acc-lock-matrix-hash");
    localStorage.removeItem("acc-lock-matrix-size");
    setMatrixKeyState(null);
    if (!pinHash) setLocked(false);
    void pushSettings({ matrixKey: null });
  }, [pinHash]);

  const getMatrixKeyData = useCallback((): MatrixKeyData | null => matrixKey, [matrixKey]);

  const setAutolockMinutes = useCallback((n: number) => {
    const v = Math.max(0, Math.floor(n));
    localStorage.setItem(AUTOLOCK_KEY, String(v));
    setAutolockMinutesState(v);
    void pushSettings({ autolockMinutes: v });
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
