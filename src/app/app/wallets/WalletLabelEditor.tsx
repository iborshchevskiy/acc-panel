"use client";

import { useState, useRef, useEffect } from "react";
import { updateWalletLabel } from "./actions";

interface Props {
  walletId: string;
  initialLabel: string | null;
}

export default function WalletLabelEditor({ walletId, initialLabel }: Props) {
  const [editing, setEditing]   = useState(false);
  const [value, setValue]       = useState(initialLabel ?? "");
  const [saved, setSaved]       = useState(initialLabel ?? "");
  const [flash, setFlash]       = useState<"idle" | "saving" | "ok" | "err">("idle");
  const inputRef                = useRef<HTMLInputElement>(null);
  const committingRef           = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    if (committingRef.current) return;
    if (value === saved) { setEditing(false); return; }
    committingRef.current = true;
    setFlash("saving");
    try {
      await updateWalletLabel(walletId, value);
      setSaved(value);
      setFlash("ok");
      setTimeout(() => setFlash("idle"), 900);
    } catch {
      setFlash("err");
      setTimeout(() => setFlash("idle"), 1500);
    } finally {
      committingRef.current = false;
      setEditing(false);
    }
  }

  function cancel() {
    setValue(saved);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter")  { e.preventDefault(); void commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        placeholder="add label…"
        className="w-full bg-transparent outline-none text-xs px-1 py-0.5 rounded"
        style={{
          border: "1px solid var(--accent)",
          color: "var(--text-1)",
          boxShadow: "0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent)",
          caretColor: "var(--accent)",
        }}
        maxLength={64}
        autoComplete="off"
        spellCheck={false}
      />
    );
  }

  const isEmpty = !saved;

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={isEmpty ? "Click to add label" : "Click to edit label"}
      className="group flex items-center gap-1.5 w-full text-left rounded px-1 py-0.5 transition-all"
      style={{
        color: flash === "ok"
          ? "var(--accent)"
          : flash === "err"
          ? "var(--red)"
          : isEmpty ? "var(--text-3)" : "var(--text-2)",
        opacity: flash === "saving" ? 0.5 : 1,
      }}
    >
      <span className="text-xs truncate">
        {saved || "—"}
      </span>
      {/* Pencil icon — visible on hover */}
      <svg
        width="10" height="10" viewBox="0 0 12 12" fill="none"
        className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ color: "var(--accent)" }}
      >
        <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L4 10l-3 1 1-3 6.5-6.5z"
          stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
