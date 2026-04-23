"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { updateAutoImport } from "./actions";

const PRESETS = [
  { value: "1h",  label: "Every hour" },
  { value: "6h",  label: "Every 6 h" },
  { value: "12h", label: "Every 12 h" },
  { value: "24h", label: "Every day" },
] as const;

type PresetValue = typeof PRESETS[number]["value"];

function intervalLabel(v: string): string {
  const preset = PRESETS.find((p) => p.value === v);
  if (preset) return preset.label;
  // custom e.g. "3h", "2d"
  const m = v.match(/^(\d+)(h|d)$/);
  if (!m) return v;
  return `Every ${m[1]} ${m[2] === "h" ? "h" : "day" + (parseInt(m[1]) > 1 ? "s" : "")}`;
}

const dropdownPanel: React.CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border-hi)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
  borderRadius: "10px",
  overflow: "hidden",
  width: "176px",
};

interface IntervalPickerProps {
  value: string;
  onChange: (v: string) => void;
}

function IntervalPicker({ value, onChange }: IntervalPickerProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customNum, setCustomNum] = useState("2");
  const [customUnit, setCustomUnit] = useState<"h" | "d">("h");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const isCustom = !PRESETS.some((p) => p.value === value);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setShowCustom(false);
    }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function openDropdown() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  }

  function selectPreset(v: string) {
    onChange(v);
    setOpen(false);
    setShowCustom(false);
  }

  function applyCustom() {
    const n = parseInt(customNum);
    if (!n || n < 1) return;
    const v = `${n}${customUnit}`;
    onChange(v);
    setOpen(false);
    setShowCustom(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        className="h-6 flex items-center gap-1 rounded px-2 text-xs transition-colors"
        style={{
          backgroundColor: "var(--raised-hi)",
          border: "1px solid var(--inner-border)",
          color: "var(--text-2)",
          whiteSpace: "nowrap",
        }}
      >
        {intervalLabel(value)}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
          style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={dropRef} style={{ ...dropdownPanel, top: pos.top, left: pos.left }}>
          {/* Presets */}
          {PRESETS.map((p) => {
            const isSel = p.value === value && !isCustom;
            return (
              <button key={p.value} type="button"
                onMouseDown={(e) => { e.preventDefault(); selectPreset(p.value); }}
                onMouseEnter={() => setHovered(p.value)}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-left"
                style={{
                  color: isSel ? "var(--accent)" : "var(--text-1)",
                  backgroundColor: hovered === p.value ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: `2px solid ${isSel ? "var(--accent)" : "transparent"}`,
                }}>
                {p.label}
                {isSel && <span style={{ color: "var(--accent)", fontSize: "10px" }}>✓</span>}
              </button>
            );
          })}

          {/* Divider + Custom */}
          <div style={{ borderTop: "1px solid var(--inner-border)" }}>
            {!showCustom ? (
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowCustom(true); }}
                onMouseEnter={() => setHovered("__custom__")}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-left"
                style={{
                  color: isCustom ? "var(--accent)" : "var(--text-2)",
                  backgroundColor: hovered === "__custom__" ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: `2px solid ${isCustom ? "var(--accent)" : "transparent"}`,
                }}>
                <span>Custom{isCustom ? `: ${intervalLabel(value)}` : ""}</span>
                {isCustom && <span style={{ color: "var(--accent)", fontSize: "10px" }}>✓</span>}
              </button>
            ) : (
              <div className="px-3 py-2.5 flex items-center gap-2">
                <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>Every</span>
                <input
                  type="number" min="1" max="999"
                  value={customNum}
                  onChange={(e) => setCustomNum(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); if (e.key === "Escape") setShowCustom(false); }}
                  className="w-12 rounded px-1.5 py-1 text-xs font-mono outline-none"
                  style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                  autoFocus
                />
                <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as "h" | "d")}
                  className="rounded px-1 py-1 text-xs outline-none"
                  style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                  <option value="h">hours</option>
                  <option value="d">days</option>
                </select>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); applyCustom(); }}
                  className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium"
                  style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}>
                  OK
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Main toggle ───────────────────────────────────────────────────────────────

interface Props {
  walletId: string;
  initialEnabled: boolean;
  initialInterval: string;
  lastSyncAt: string | null;
}

export default function AutoImportToggle({ walletId, initialEnabled, initialInterval, lastSyncAt }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [interval, setInterval] = useState(initialInterval);
  const [isPending, startTransition] = useTransition();
  const [saveErr, setSaveErr] = useState(false);

  async function save(nextEnabled: boolean, nextInterval: string) {
    try {
      await updateAutoImport(walletId, nextEnabled, nextInterval);
      setSaveErr(false);
    } catch {
      // Revert optimistic state on failure
      setEnabled(initialEnabled);
      setInterval(initialInterval);
      setSaveErr(true);
      setTimeout(() => setSaveErr(false), 3000);
    }
  }

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(() => { void save(next, interval); });
  }

  function handleInterval(v: string) {
    setInterval(v);
    if (enabled) {
      startTransition(() => { void save(true, v); });
    }
  }

  return (
    <div className="flex items-center gap-2" style={{ minWidth: "220px" }}>
      {/* Toggle switch */}
      <button type="button" onClick={handleToggle} disabled={isPending}
        title={enabled ? "Disable auto-import" : "Enable auto-import"}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40"
        style={{ backgroundColor: enabled ? "var(--accent)" : "var(--raised-hi)", border: "1px solid var(--inner-border)" }}>
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
          style={{ transform: enabled ? "translateX(17px)" : "translateX(2px)" }} />
      </button>

      {enabled && <IntervalPicker value={interval} onChange={handleInterval} />}

      {saveErr && (
        <span className="text-[10px]" style={{ color: "var(--red)" }}>save failed</span>
      )}

      {!saveErr && enabled && lastSyncAt && (
        <span className="text-[10px] font-mono" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
          {new Date(lastSyncAt).toLocaleString("sv-SE").slice(0, 16).replace("T", " ")}
        </span>
      )}
    </div>
  );
}
