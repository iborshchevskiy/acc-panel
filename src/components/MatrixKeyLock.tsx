"use client";

import { useState, useRef, useEffect } from "react";
import type { MatrixKeyData } from "./LockProvider";

// ── constants ────────────────────────────────────────────────────────────────
const GRID_COLS  = 6;
const GRID_ROWS  = 9;
const CELL_DESKTOP = 56; // px — slot pitch on roomy screens
const CELL_MOBILE  = 48; // px — slot pitch on narrow phones (< 380px viewport)
const PAT          = 20; // pattern tiles this many × this many

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

  // Responsive cell size — collapses to a more compact pitch on narrow phones
  // so the 6×9 grid still fits with side margins on a 360px-wide viewport.
  const [cell, setCell] = useState<number>(CELL_DESKTOP);

  // Setup mode: which cell the user tapped
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);

  const ptr        = useRef<{ cx: number; cy: number; ox0: number; oy0: number } | null>(null);
  const hasDragged = useRef(false);

  // Randomise starting position each time the component mounts
  useEffect(() => {
    setOx(Math.floor(Math.random() * PAT));
    setOy(Math.floor(Math.random() * PAT));
  }, []);

  // Track viewport so cell size scales for narrow phones.
  useEffect(() => {
    function update() {
      setCell(window.innerWidth < 380 ? CELL_MOBILE : CELL_DESKTOP);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const CIRCLE = cell - 12; // diameter of each circle = pitch − gap

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
    const dx = (e.clientX - ptr.current.cx) / cell;
    const dy = (e.clientY - ptr.current.cy) / cell;
    if (Math.abs(dx) > 0.06 || Math.abs(dy) > 0.06) hasDragged.current = true;
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
      }, 240); // wait for snap animation
    }
  }

  // ── cell tap (setup only) ───────────────────────────────────────────────────
  function onContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "setup" || hasDragged.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const col  = Math.floor((e.clientX - rect.left)  / cell);
    const row  = Math.floor((e.clientY - rect.top) / cell);
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
  const tx     = -(fracX + 1) * cell;
  const ty     = -(fracY + 1) * cell;

  // "Live" snapped offsets — update as the user drags past the half-cell mark.
  // This lets the circles tick over to the next digit while you're still
  // moving, instead of waiting for release.
  const liveOx = Math.round(ox);
  const liveOy = Math.round(oy);

  const selectedDigit = selectedCell !== null
    ? dig(pattern, liveOx + selectedCell.x, liveOy + selectedCell.y)
    : null;

  // ── status colours ─────────────────────────────────────────────────────────
  // Theme-aware: idle digits use --text-1 (near-black on Snow / Sepia,
  // near-white on Midnight / Amber / Plum). Error / success use the
  // semantic --red and --accent vars so they read correctly on every theme.
  const accentColor =
    status === "error"     ? "var(--red)"
    : status === "success" ? "var(--accent)"
    :                        "var(--text-1)";

  const borderColor =
    status === "error"     ? "color-mix(in srgb, var(--red) 55%, transparent)"
    : status === "success" ? "color-mix(in srgb, var(--accent) 55%, transparent)"
    :                        "var(--inner-border)";

  const glowColor =
    status === "error"     ? "color-mix(in srgb, var(--red) 18%, transparent)"
    : status === "success" ? "color-mix(in srgb, var(--accent) 22%, transparent)"
    :                        "transparent";

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Instruction line */}
      <p className="text-xs text-center leading-relaxed"
        style={{ color: "var(--text-4)", maxWidth: 320 }}>
        {mode === "setup"
          ? "Drag the digit field, then tap a circle — that digit + position becomes your key."
          : "Drag until your digit lands in your circle, then release."}
      </p>

      {/* ── Grid container ────────────────────────────────────────────────── */}
      <div
        className="relative select-none"
        style={{
          width:  GRID_COLS * cell,
          height: GRID_ROWS * cell,
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: 20,
          border: `1px solid ${borderColor}`,
          boxShadow: `0 0 32px ${glowColor}, 0 8px 32px color-mix(in srgb, var(--text-1) 22%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-1) 4%, transparent)`,
          cursor: dragging ? "grabbing" : "grab",
          background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--text-1) 2%, transparent), transparent 70%), var(--bg)",
          transition: "border-color 0.3s, box-shadow 0.3s",
          animation: status === "error" ? "mkShake 0.5s ease-in-out" : undefined,
          touchAction: "none",
        }}
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerCancel={onPtrUp}
        onClick={onContainerClick}
      >
        {/* ── Layer 1: scrolling background pattern (dim, ambient) ─────────── */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            display: "grid",
            gridTemplateColumns: `repeat(${rCols}, ${cell}px)`,
            transform: `translate(${tx}px, ${ty}px)`,
            transition: dragging ? "none" : "transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1)",
            willChange: "transform",
            pointerEvents: "none",
          }}
        >
          {Array.from({ length: rRows * rCols }, (_, i) => {
            const c = i % rCols;
            const r = Math.floor(i / rCols);
            const d = dig(pattern, floorX + c - 1, floorY + r - 1);
            return (
              <div key={i}
                style={{
                  width: cell, height: cell,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <span style={{
                  fontSize: 17, fontWeight: 500,
                  fontFamily: "var(--font-ibm-plex-mono, monospace)",
                  lineHeight: 1,
                  color: "color-mix(in srgb, var(--text-1) 16%, transparent)",
                  userSelect: "none",
                }}>
                  {d}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Layer 2: foreground circles (fixed positions) ─────────────────── */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_COLS}, ${cell}px)`,
            gridAutoRows: `${cell}px`,
            pointerEvents: "none",
          }}
        >
          {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
            const col = i % GRID_COLS;
            const row = Math.floor(i / GRID_COLS);
            const d   = dig(pattern, liveOx + col, liveOy + row);
            const isSelected = mode === "setup" &&
              selectedCell?.x === col && selectedCell?.y === row;

            const circleBorder =
              status === "error"     ? "color-mix(in srgb, var(--red) 45%, transparent)"
              : status === "success" ? "color-mix(in srgb, var(--accent) 55%, transparent)"
              : isSelected           ? "color-mix(in srgb, var(--accent) 65%, transparent)"
              :                        "var(--inner-border)";

            const circleBg =
              isSelected             ? "color-mix(in srgb, var(--accent) 10%, transparent)"
              : status === "error"   ? "color-mix(in srgb, var(--red) 6%, transparent)"
              : status === "success" ? "color-mix(in srgb, var(--accent) 6%, transparent)"
              :                        "color-mix(in srgb, var(--text-1) 4%, transparent)";

            const digitColor =
              isSelected             ? "var(--accent)"
              : status === "error"   ? "var(--red)"
              : status === "success" ? "var(--accent)"
              :                        accentColor;

            const digitShadow = isSelected
              ? "0 0 14px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 28px color-mix(in srgb, var(--accent) 25%, transparent)"
              : status === "success"
              ? "0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)"
              : status === "error"
              ? "0 0 14px color-mix(in srgb, var(--red) 40%, transparent)"
              : "none";

            return (
              <div key={i}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <div
                  style={{
                    width: CIRCLE, height: CIRCLE,
                    borderRadius: "50%",
                    background: circleBg,
                    border: `1.5px solid ${circleBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isSelected
                      ? "0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent), inset 0 0 12px color-mix(in srgb, var(--accent) 6%, transparent)"
                      : "inset 0 1px 0 color-mix(in srgb, var(--text-1) 4%, transparent), 0 1px 2px color-mix(in srgb, var(--text-1) 12%, transparent)",
                    transition: "background-color 0.18s, border-color 0.18s, box-shadow 0.25s",
                  }}
                >
                  <span style={{
                    fontSize: 20, fontWeight: 600,
                    fontFamily: "var(--font-ibm-plex-mono, monospace)",
                    lineHeight: 1,
                    color: digitColor,
                    textShadow: digitShadow,
                    transition: "color 0.18s, text-shadow 0.25s",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {d}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Vignette — theme-aware: darkens edges using --text-1 so it
            shows correctly on light themes (where pure-black would
            scream) and dark themes alike. */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 60%, color-mix(in srgb, var(--text-1) 18%, transparent) 100%)",
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
            You can still drag to pick a different digit.
          </p>

          <div className="flex gap-3 items-center">
            <button
              type="button"
              onClick={() => onSave?.({
                secretNumber: dig(pattern, liveOx + selectedCell.x, liveOy + selectedCell.y),
                secretCell: selectedCell,
                pattern,
              })}
              className="h-8 rounded-md px-4 text-xs font-medium transition-opacity hover:opacity-80"
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
