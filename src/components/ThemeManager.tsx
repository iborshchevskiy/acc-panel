"use client";

import { useEffect, useState } from "react";

export const THEMES = [
  { key: "dark",   name: "Midnight",       sub: "deep dark · emerald",   tone: "dark" as const,
    swatch: { bg: "#07090c", surface: "#161b27", accent: "#10b981", text: "#e2e8f0" } },
  { key: "light",  name: "Snow",           sub: "warm white · forest",   tone: "light" as const,
    swatch: { bg: "#f4f7fb", surface: "#ffffff", accent: "#047857", text: "#0d1520" } },
  { key: "sepia",  name: "Sepia",          sub: "low-glare beige",       tone: "light" as const,
    swatch: { bg: "#f3ecdf", surface: "#faf4e7", accent: "#7a5910", text: "#2b2008" } },
  { key: "amber",  name: "Amber Terminal", sub: "CRT amber · retro",     tone: "dark" as const,
    swatch: { bg: "#0a0703", surface: "#1f1608", accent: "#fbbf24", text: "#f5e6c4" } },
  { key: "plum",   name: "Plum",           sub: "violet · late ops",     tone: "dark" as const,
    swatch: { bg: "#0c0814", surface: "#221932", accent: "#a78bfa", text: "#ece4ff" } },
] as const;

type ThemeKey = typeof THEMES[number]["key"];
const ALLOWED = new Set<string>(THEMES.map(t => t.key));

export function applyTheme(theme: string) {
  const t = ALLOWED.has(theme) ? theme : "dark";
  document.documentElement.classList.remove(...THEMES.map(x => x.key));
  document.documentElement.classList.add(t);
  localStorage.setItem("acc-theme", t);
}

/**
 * Mount once near the root. On first paint the inline script in layout.tsx
 * has already applied whatever theme was in localStorage; this component
 * then asks the server for the canonical value and reapplies if different.
 * Keeps theme in sync across browsers / devices for the same account.
 */
export function ThemeSync() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/lock-settings", { credentials: "same-origin" });
        if (!r.ok) return;
        const data = await r.json() as { theme?: string | null };
        if (cancelled) return;
        if (data.theme && ALLOWED.has(data.theme)) {
          if (localStorage.getItem("acc-theme") !== data.theme) applyTheme(data.theme);
        } else {
          // Server has no theme yet — push our local choice up so other
          // devices pick it up next time.
          const local = localStorage.getItem("acc-theme") ?? "dark";
          if (ALLOWED.has(local)) {
            void fetch("/api/lock-settings", {
              method: "PUT",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ theme: local }),
            });
          }
        }
      } catch { /* offline */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}

export function ThemePicker() {
  const [active, setActive] = useState<ThemeKey>("dark");

  useEffect(() => {
    const t = localStorage.getItem("acc-theme");
    if (t && ALLOWED.has(t)) setActive(t as ThemeKey);
  }, []);

  function pick(key: ThemeKey) {
    setActive(key);
    applyTheme(key);
    void fetch("/api/lock-settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: key }),
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {THEMES.map(t => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => pick(t.key)}
            className="group flex flex-col rounded-xl overflow-hidden transition-all active:scale-[0.99]"
            style={{
              border: isActive
                ? `1.5px solid color-mix(in srgb, var(--accent) 70%, transparent)`
                : "1px solid var(--border)",
              backgroundColor: "var(--surface)",
              boxShadow: isActive
                ? "0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent)"
                : "none",
            }}
          >
            {/* Swatch preview */}
            <div className="relative h-20 flex"
              style={{ backgroundColor: t.swatch.bg }}>
              <div className="flex-1" style={{ backgroundColor: t.swatch.bg }} />
              <div className="flex-1 flex flex-col justify-center px-3 gap-1.5"
                style={{ backgroundColor: t.swatch.surface }}>
                <span className="block w-12 h-1.5 rounded-full"
                  style={{ backgroundColor: t.swatch.text, opacity: 0.92 }} />
                <span className="block w-8 h-1 rounded-full"
                  style={{ backgroundColor: t.swatch.text, opacity: 0.5 }} />
                <span className="block w-10 h-1.5 rounded-full mt-0.5"
                  style={{ backgroundColor: t.swatch.accent }} />
              </div>
              {isActive && (
                <span className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full"
                  style={{ backgroundColor: t.swatch.accent, color: t.swatch.bg }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </div>
            {/* Label */}
            <div className="px-3.5 py-2.5 text-left">
              <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{t.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{t.sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
