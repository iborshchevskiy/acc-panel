"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps any subtree. On mount it walks the descendants once for elements with
 * the .reveal class and uses a single IntersectionObserver to add .is-in when
 * each enters the viewport. Cheaper than wrapping every child and lets server
 * components stay server-rendered (this is just a passive enhancer).
 */
export default function ScrollReveal({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Fallback: just show everything
      node.querySelectorAll<HTMLElement>(".reveal").forEach(el => el.classList.add("is-in"));
      return;
    }
    const targets = Array.from(node.querySelectorAll<HTMLElement>(".reveal"));
    if (targets.length === 0) return;
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: "-8% 0px -8% 0px", threshold: 0.05 });
    targets.forEach(t => io.observe(t));
    return () => io.disconnect();
  }, []);

  return <div ref={root}>{children}</div>;
}
