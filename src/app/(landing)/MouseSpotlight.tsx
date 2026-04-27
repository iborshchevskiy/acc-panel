"use client";

import { useEffect, useRef } from "react";

/**
 * Drops a single absolutely-positioned div behind its parent and updates two
 * CSS variables (--mx, --my) on it as the cursor moves over the parent. The
 * actual gradient lives in the .spotlight class in globals.css. Pointer-only;
 * does nothing on touch devices and respects prefers-reduced-motion.
 */
export default function MouseSpotlight({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isCoarse = matchMedia("(hover: none), (pointer: coarse)").matches;
    const reduce   = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isCoarse || reduce) return;

    const parent = el.parentElement;
    if (!parent) return;

    let raf = 0;
    let pending: { x: number; y: number } | null = null;

    function onMove(e: MouseEvent) {
      if (!parent || !el) return;
      const r = parent.getBoundingClientRect();
      pending = {
        x: ((e.clientX - r.left) / r.width)  * 100,
        y: ((e.clientY - r.top)  / r.height) * 100,
      };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!pending || !el) return;
        el.style.setProperty("--mx", `${pending.x}%`);
        el.style.setProperty("--my", `${pending.y}%`);
      });
    }

    parent.addEventListener("pointermove", onMove);
    return () => {
      parent.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className={`spotlight ${className ?? ""}`} />;
}
