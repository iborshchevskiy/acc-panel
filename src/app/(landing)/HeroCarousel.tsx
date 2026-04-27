"use client";

import { useState, useEffect, useRef } from "react";

interface Panel {
  id: string;
  name: string;
  hint: string;
  node: React.ReactNode;
}

const SLOT_MS = 7800;

export default function HeroCarousel({ panels }: { panels: Panel[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(performance.now());

  // Auto-advance + progress bar
  useEffect(() => {
    if (paused) return;
    startRef.current = performance.now();
    setProgress(0);
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const p = Math.min(1, elapsed / SLOT_MS);
      setProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setActive((i) => (i + 1) % panels.length);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, paused, panels.length]);

  return (
    <div className="relative w-full max-w-[460px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Outer glow */}
      <div aria-hidden className="absolute -inset-4 rounded-3xl pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 50%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%)",
          filter: "blur(20px)",
        }} />

      {/* Frame chrome */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid color-mix(in srgb, var(--accent) 20%, var(--border))",
          boxShadow: "0 32px 80px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}>
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ backgroundColor: "var(--raised)", borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
          </div>
          <span className="text-[10px] font-mono tracking-wider transition-colors duration-500"
            style={{ color: "var(--text-3)" }}>
            accpanel · {panels[active]?.id ?? ""}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>
            ●LIVE
          </span>
        </div>

        {/* Stage */}
        <div className="relative" style={{ minHeight: 340 }}>
          {panels.map((panel, i) => {
            const isActive = i === active;
            return (
              <div key={panel.id}
                aria-hidden={!isActive}
                className="absolute inset-0 px-4 pt-3 pb-4 flex flex-col"
                style={{
                  opacity: isActive ? 1 : 0,
                  transform: isActive ? "translateX(0) scale(1)" : "translateX(16px) scale(0.985)",
                  transition: "opacity 0.6s cubic-bezier(.16,1,.3,1), transform 0.6s cubic-bezier(.16,1,.3,1)",
                  pointerEvents: isActive ? "auto" : "none",
                }}>
                {panel.node}
              </div>
            );
          })}
        </div>

        {/* Bottom indicator strip */}
        <div className="flex items-stretch gap-1 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--raised)" }}>
          {panels.map((p, i) => {
            const isActive = i === active;
            const fill = isActive ? progress : (i < active ? 1 : 0);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setActive(i); }}
                className="group flex-1 flex flex-col gap-1.5 items-start text-left"
              >
                <div className="w-full h-[2px] rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--inner-border)" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${fill * 100}%`,
                      backgroundColor: "var(--accent)",
                      transition: paused || !isActive ? "width 0.3s ease" : "none",
                    }} />
                </div>
                <span className="text-[9px] font-mono uppercase tracking-[0.16em] truncate w-full transition-colors"
                  style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}>
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cursor */}
      <div className="absolute -bottom-7 left-2 flex items-center gap-1">
        <span className="text-[11px] font-mono" style={{ color: "var(--accent)", opacity: 0.55 }}>
          $ accpanel · {panels[active]?.hint ?? ""}
        </span>
        <span className="w-1.5 h-3.5 inline-block ml-0.5"
          style={{ backgroundColor: "var(--accent)", animation: "cursor-blink 1.1s step-end infinite" }} />
      </div>
    </div>
  );
}
