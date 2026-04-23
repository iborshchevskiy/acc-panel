"use client";

import { useState, useRef } from "react";

export const GRID_ROWS = ["A", "B", "C", "D", "E", "F"] as const;
export const GRID_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

interface MatrixGridProps {
  placements: Record<string, number>;   // coord → digit, e.g. { "B2": 7, "A4": 3 }
  onChange: (placements: Record<string, number>) => void;
  error?: boolean;          // red highlight on all placed cells (wrong attempt)
  allowClickRemove?: boolean; // click a placed digit to return it to the tray
}

export default function MatrixGrid({ placements, onChange, error, allowClickRemove }: MatrixGridProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragDigit  = useRef<number | null>(null);
  const dragFrom   = useRef<string | undefined>(undefined);

  const placedSet  = new Set(Object.values(placements));
  const trayDigits = [0,1,2,3,4,5,6,7,8,9].filter(d => !placedSet.has(d));

  function startDrag(digit: number, fromCoord?: string) {
    dragDigit.current = digit;
    dragFrom.current  = fromCoord;
  }

  function endDrag() {
    dragDigit.current = null;
    dragFrom.current  = undefined;
  }

  function dropOnCell(toCoord: string) {
    if (dragDigit.current === null) return;
    const next     = { ...placements };
    const existing = next[toCoord];          // might be occupied
    if (dragFrom.current !== undefined) {
      delete next[dragFrom.current];          // remove from source cell
      if (existing !== undefined) {
        next[dragFrom.current] = existing;    // swap: existing goes back to source
      }
    }
    next[toCoord] = dragDigit.current;
    onChange(next);
    endDrag();
    setDropTarget(null);
  }

  function dropOnTray() {
    if (dragFrom.current !== undefined) {
      const next = { ...placements };
      delete next[dragFrom.current];
      onChange(next);
    }
    endDrag();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Grid */}
      <div>
        {/* Column headers — offset by row-label width (w-5=20px) + gap-1(4px) = ml-6 */}
        <div className="flex gap-1 mb-1 ml-6">
          {GRID_COLS.map(c => (
            <div key={c} className="w-9 text-center text-[9px] font-mono"
              style={{ color: "var(--text-3)" }}>
              {c}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {GRID_ROWS.map(row => (
            <div key={row} className="flex gap-1 items-center">
              {/* Row label */}
              <div className="w-5 text-[10px] font-mono text-center" style={{ color: "var(--text-3)" }}>
                {row}
              </div>

              {GRID_COLS.map(col => {
                const coord      = `${row}${col}`;
                const digit      = placements[coord];
                const isOccupied = digit !== undefined;
                const isTarget   = dropTarget === coord;

                return (
                  <div
                    key={coord}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-100"
                    style={{
                      backgroundColor: isTarget    ? "var(--accent-lo)"
                        : isOccupied               ? "var(--raised-hi)"
                        : "var(--surface)",
                      border: isTarget             ? "1.5px solid var(--accent)"
                        : isOccupied && error      ? "1.5px solid var(--red)"
                        : isOccupied               ? "1px solid var(--border)"
                        : "1.5px dashed var(--surface-lo)",
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDropTarget(coord); }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => { e.preventDefault(); dropOnCell(coord); }}
                  >
                    {isOccupied ? (
                      <span
                        draggable
                        className="text-sm font-bold leading-none"
                        style={{
                          color: error ? "var(--red)" : "var(--text-1)",
                          cursor: "grab",
                          userSelect: "none",
                        }}
                        onDragStart={() => startDrag(digit, coord)}
                        onDragEnd={endDrag}
                        onClick={() => {
                          if (allowClickRemove) {
                            const next = { ...placements };
                            delete next[coord];
                            onChange(next);
                          }
                        }}
                        title={allowClickRemove ? "Click to remove" : undefined}
                      >
                        {digit}
                      </span>
                    ) : (
                      <span className="text-[7px] font-mono pointer-events-none leading-none"
                        style={{ color: "var(--surface-lo)" }}>
                        {coord}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Digit tray — also a drop target to remove digits from the grid */}
      <div
        className="flex flex-wrap gap-2 justify-center px-4 py-2.5 rounded-xl"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--inner-border)",
          minWidth: "460px",
          minHeight: "52px",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); dropOnTray(); }}
      >
        {trayDigits.length === 0 ? (
          <span className="text-[10px] self-center" style={{ color: "var(--text-3)", userSelect: "none" }}>
            drag here to remove
          </span>
        ) : (
          trayDigits.map(d => (
            <div
              key={d}
              draggable
              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-transform active:scale-95"
              style={{
                backgroundColor: "var(--raised-hi)",
                border: "1px solid var(--border)",
                color: "var(--text-1)",
                cursor: "grab",
                userSelect: "none",
              }}
              onDragStart={() => startDrag(d)}
              onDragEnd={endDrag}
            >
              {d}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
