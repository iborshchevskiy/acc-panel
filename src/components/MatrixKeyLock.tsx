"use client";

import { useState, useRef, useEffect } from "react";
import type { MatrixKeyData } from "./LockProvider";

// ── constants ────────────────────────────────────────────────────────────────
const GRID_COLS  = 6;
const GRID_ROWS  = 9;
const CELL_SIZE  = 56;   // px
const PAT        = 20;   // pattern tiles this many × this many

// ── helpers ──────────────────────────────────────────────────────────────────
export function generatePattern(): number[][] {
  return Array.from({ length: PAT }, () =>
    Array.from({ length: PAT }, () => Math.floor(Math.random() * 10))
  );
}

function dig(pattern: number[][], px: number, py: number): number {
  return pattern[((Math.floor(py) % PAT) + PAT) % PAT][((Math.floor(px) % PAT) + PAT) % PAT];
}

// ── component ─────────────────────────────────────────────────────────────────
type Status = "idle" | "success" | "error";

interface Props {
  mode: "setup" | "unlock";
  // unlock:
  secretNumber?: number;
  secretCell?: { x: number; y: number };
  pattern?: number[][];
  onSuccess?: () => void;
  // setup:
  onSave?: (data: MatrixKeyData) => void;
  onCancel?: () => void;
}

export default function MatrixKeyLock({
  mode,
  secretNumber,
  secretCell,
  pattern: propPattern,
  onSuccess,
  onSave,
  onCancel,
}: Props) {
  // Fixed pattern for this lock instance
  const [pattern] = useState<number[][]>(() => propPattern ?? generatePattern());

  // Offset in cells (fractional during drag, integer at rest)
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  // Setup mode: which cell the user tapped
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);

  const ptr       = useRef<{ cx: number; cy: number; ox0: number; oy0: number } | null>(null);
  const hasDragged = useRef(false);

  // Randomise starting position each time the component mounts
  useEffect(() => {
    setOx(Math.floor(Math.random() * PAT));
    setOy(Math.floor(Math.random() * PAT));
  }, []);

  // ── drag handling ───────────────────────────────────────────────────────────
  function onPtrDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hasDragged.current = false;
    ptr.current = { cx: e.clientX, cy: e.clientY, ox0: Math.round(ox), oy0: Math.round(oy) };
    setDragging(true);
  }

  function onPtrMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!ptr.current) return;
    const dx = (e.clientX - ptr.current.cx) / CELL_SIZE;
    const dy = (e.clientY - ptr.current.cy) / CELL_SIZE;
    if (Math.abs(dx) > 0.06 || Math.abs(dy) > 0.06) hasDragged.current = true;
    // Negate: dragging down moves numbers down (not up)
    setOx(ptr.current.ox0 - dx);
    setOy(ptr.current.oy0 - dy);
  }

  function onPtrUp() {
    if (!ptr.current) return;
    const sx = Math.round(ox);
    const sy = Math.round(oy);
    ptr.current = null;
    setDragging(false);
    setOx(sx);
    setOy(sy);

    if (mode === "unlock") {
      setTimeout(() => {
        if (secretNumber === undefined || !secretCell) return;
        const d = dig(pattern, sx + secretCell.x, sy + secretCell.y);
        if (d === secretNumber) {
          setStatus("success");
          setTimeout(() => onSuccess?.(), 500);
        } else {
          setStatus("error");
          setTimeout(() => setStatus("idle"), 900);
        }
      }, 220); // wait for snap animation
    }
  }

  // ── cell tap (setup only) ───────────────────────────────────────────────────
  function onContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "setup" || hasDragged.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const col  = Math.floor((e.clientX - rect.left)  / CELL_SIZE);
    const row  = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
      setSelectedCell({ x: col, y: row });
    }
  }

  // ── render params ───────────────────────────────────────────────────────────
  const floorX = Math.floor(ox);
  const floorY = Math.floor(oy);
  const fracX  = ox - floorX;
  const fracY  = oy - floorY;
  const rCols  = GRID_COLS + 2;
  const rRows  = GRID_ROWS + 2;
  const tx     = -(fracX + 1) * CELL_SIZE;
  const ty     = -(fracY + 1) * CELL_SIZE;

  const snappedOx    = Math.round(ox);
  const snappedOy    = Math.round(oy);
  const selectedDigit = selectedCell !== null
    ? dig(pattern, snappedOx + selectedCell.x, snappedOy + selectedCell.y)
    : null;

  // ── border / glow based on status ──────────────────────────────────────────
  const borderColor =
    status === "error"   ? "rgba(239,68,68,0.7)"
    : status === "success" ? "rgba(16,185,129,0.7)"
    : "rgba(255,255,255,0.08)";
  const glowColor =
    status === "error"   ? "rgba(239,68,68,0.2)"
    : status === "success" ? "rgba(16,185,129,0.2)"
    : "transparent";

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Instruction line */}
      <p className="text-xs text-center leading-relaxed"
        style={{ color: "var(--text-4)", maxWidth: 300 }}>
        {mode === "setup"
          ? "Slide the grid, then tap a cell — that digit + position becomes your key."
          : "Slide until your digit is at your position, then release."}
      </p>

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      <div
        className="relative"
        style={{
          width:  GRID_COLS * CELL_SIZE,
          height: GRID_ROWS * CELL_SIZE,
          overflow: "hidden",
          borderRadius: 16,
          border: `1px solid ${borderColor}`,
          boxShadow: `0 0 32px ${glowColor}, 0 8px 32px rgba(0,0,0,0.5)`,
          cursor: dragging ? "grabbing" : "grab",
          transition: "border-color 0.3s, box-shadow 0.3s",
          animation: status === "error" ? "mkShake 0.5s ease-in-out" : undefined,
        }}
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerCancel={onPtrUp}
        onClick={onContainerClick}
      >
        {/* Tile layer */}
        <div
          style={{
            position: "absolute",
            display: "grid",
            gridTemplateColumns: `repeat(${rCols}, ${CELL_SIZE}px)`,
            transform: `translate(${tx}px, ${ty}px)`,
            transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            willChange: "transform",
          }}
        >
          {Array.from({ length: rRows * rCols }, (_, i) => {
            const c      = i % rCols;
            const r      = Math.floor(i / rCols);
            const visCol = c - 1;
            const visRow = r - 1;
            const inGrid = visCol >= 0 && visCol < GRID_COLS && visRow >= 0 && visRow < GRID_ROWS;
            const d      = dig(pattern, floorX + c - 1, floorY + r - 1);

            const isSelected = inGrid && mode === "setup" &&
              selectedCell?.x === visCol && selectedCell?.y === visRow;

            const digitColor =
              status === "error"    ? "rgba(239,68,68,0.85)"
              : status === "success"  ? "rgba(16,185,129,0.85)"
              : isSelected          ? "rgba(16,185,129,1)"
              : "rgba(255,255,255,0.62)";

            return (
              <div
                key={i}
                style={{
                  width: CELL_SIZE, height: CELL_SIZE,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                  backgroundColor: isSelected ? "rgba(16,185,129,0.08)" : "transparent",
                  borderRight:  "0.5px solid rgba(255,255,255,0.05)",
                  borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                }}
              >
                {/* The digit */}
                <span style={{
                  fontSize: 24, fontWeight: 700,
                  fontFamily: "var(--font-ibm-plex-mono, monospace)",
                  lineHeight: 1, color: digitColor,
                  textShadow: isSelected
                    ? "0 0 14px rgba(16,185,129,0.7), 0 0 28px rgba(16,185,129,0.3)"
                    : "none",
                  pointerEvents: "none", userSelect: "none",
                  transition: "color 0.3s",
                }}>
                  {d}
                </span>

                {/* Selected cell ring (setup) */}
                {isSelected && (
                  <div style={{
                    position: "absolute", inset: 3, borderRadius: 10,
                    border: "1.5px solid rgba(16,185,129,0.55)",
                    pointerEvents: "none",
                    boxShadow: "0 0 12px rgba(16,185,129,0.15), inset 0 0 8px rgba(16,185,129,0.05)",
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Vignette */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)",
        }} />
      </div>

      {/* ── Setup: selected-cell confirmation ────────────────────────────── */}
      {mode === "setup" && selectedCell !== null && (
        <div className="flex flex-col items-center gap-3">
          <div className="px-5 py-3 rounded-xl text-center"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--green-alert-border)" }}>
            <p className="text-[10px] uppercase tracking-widest mb-1"
              style={{ color: "var(--text-3)", letterSpacing: "0.12em" }}>Your key</p>
            <p className="text-3xl font-bold font-mono leading-none"
              style={{ color: "var(--accent)", textShadow: "0 0 18px var(--accent)" }}>
              {selectedDigit}
            </p>
            <p className="text-[10px] font-mono mt-1.5" style={{ color: "var(--text-3)" }}>
              col {selectedCell.x} · row {selectedCell.y}
            </p>
          </div>

          <p className="text-xs text-center leading-relaxed" style={{ color: "var(--text-4)", maxWidth: 280 }}>
            Memorise: digit{" "}
            <strong style={{ color: "var(--text-2)" }}>{selectedDigit}</strong>{" "}
            at col{" "}
            <strong style={{ color: "var(--text-2)" }}>{selectedCell.x}</strong>,
            row{" "}
            <strong style={{ color: "var(--text-2)" }}>{selectedCell.y}</strong>.
            You can still slide to pick a different digit.
          </p>

          <div className="flex gap-3 items-center">
            <button
              type="button"
              onClick={() => onSave?.({
                secretNumber: dig(pattern, snappedOx + selectedCell.x, snappedOy + selectedCell.y),
                secretCell: selectedCell,
                pattern,
              })}
              className="h-7 rounded px-4 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: "var(--green-btn-bg)", color: "var(--accent)", border: "1px solid var(--green-btn-border)" }}
            >
              Save key
            </button>
            <button type="button" onClick={() => setSelectedCell(null)}
              className="text-xs transition-opacity hover:opacity-60"
              style={{ color: "var(--text-3)" }}>
              Clear
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel}
                className="text-xs transition-opacity hover:opacity-60"
                style={{ color: "var(--text-3)" }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "setup" && selectedCell === null && onCancel && (
        <button type="button" onClick={onCancel}
          className="text-xs transition-opacity hover:opacity-60"
          style={{ color: "var(--text-3)" }}>
          Cancel
        </button>
      )}

      <style>{`
        @keyframes mkShake {
          0%,100% { transform: translateX(0); }
          15%     { transform: translateX(-7px); }
          30%     { transform: translateX(7px); }
          50%     { transform: translateX(-5px); }
          70%     { transform: translateX(5px); }
          90%     { transform: translateX(-2px); }
        }
      `}</style>
    </div>
  );
}
