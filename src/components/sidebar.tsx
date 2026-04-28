"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useLock } from "./LockProvider";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/app/dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
  },
  {
    label: "Transactions",
    href: "/app/transactions",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5h12M2 8h8M2 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M12 10l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Wallets",
    href: "/app/wallets",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M1 6h14" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="11.5" cy="9.5" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Clients",
    href: "/app/clients",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M11 7.5l1.5 1.5L15 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Expenses",
    href: "/app/expenses",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2v12M5 10l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Analytics",
    href: "/app/analytics",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 2.5L12 5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "FIFO",
    href: "/app/fifo",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4h12M4 4V2M12 4V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <rect x="3" y="6" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M6 9.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Debts",
    href: "/app/debts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M8 5v3.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Capital",
    href: "/app/capital",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13V8l3-3 3 2 3-4 3 2v8H2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Data",
    href: "/app/data",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="4" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2.5 4v4c0 1.105 2.462 2 5.5 2s5.5-.895 5.5-2V4" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2.5 8v4c0 1.105 2.462 2 5.5 2s5.5-.895 5.5-2V8" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
  },
];

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: "#f59e0b" }}>
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: "#818cf8" }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-2)" }}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-2)" }}>
    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const SignOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const HelpIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-2)" }}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="17" r="0.9" fill="currentColor"/>
  </svg>
);

interface SidebarProps {
  userEmail: string;
  orgName?: string;
}

type ThemeKey = "dark" | "light" | "sepia" | "amber" | "plum";
const THEME_KEYS: ThemeKey[] = ["dark", "light", "sepia", "amber", "plum"];
const THEME_NAMES: Record<ThemeKey, string> = {
  dark: "Midnight", light: "Snow", sepia: "Sepia", amber: "Amber", plum: "Plum",
};

export default function Sidebar({ userEmail, orgName }: SidebarProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeKey>("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { hasPin, lock } = useLock();

  useEffect(() => {
    const stored = (localStorage.getItem("acc-theme") ?? "dark") as ThemeKey;
    const t: ThemeKey = THEME_KEYS.includes(stored) ? stored : "dark";
    setTheme(t);
    document.documentElement.classList.remove(...THEME_KEYS);
    document.documentElement.classList.add(t);
    if (localStorage.getItem("acc-sidebar-collapsed") === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  function toggleTheme() {
    // Cycle through all themes; full picker lives in Settings → Appearance.
    const idx = THEME_KEYS.indexOf(theme);
    const next = THEME_KEYS[(idx + 1) % THEME_KEYS.length];
    setTheme(next);
    localStorage.setItem("acc-theme", next);
    document.documentElement.classList.remove(...THEME_KEYS);
    document.documentElement.classList.add(next);
    void fetch("/api/lock-settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: next }),
    });
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("acc-sidebar-collapsed", next ? "1" : "0");
    if (menuOpen) setMenuOpen(false);
  }

  const initial = (userEmail?.[0] ?? "?").toUpperCase();

  // Shared transition for text fading
  const textStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    overflow: "hidden",
    whiteSpace: "nowrap",
    opacity: collapsed ? 0 : 1,
    maxWidth: collapsed ? 0 : 200,
    transition: "opacity 150ms ease, max-width 220ms cubic-bezier(0.4,0,0.2,1)",
    ...extra,
  });

  // Mobile bottom tab bar — Dashboard, Transactions, [Lock], Wallets, More
  // Clients now lives in the More sheet.
  const NAV_BY_HREF = Object.fromEntries(NAV_ITEMS.map(i => [i.href, i]));
  const LEFT_TABS = [NAV_BY_HREF["/app/dashboard"], NAV_BY_HREF["/app/transactions"]];
  const RIGHT_TABS = [NAV_BY_HREF["/app/wallets"]];
  const SECONDARY_TABS = NAV_ITEMS.filter(item =>
    !["/app/dashboard", "/app/transactions", "/app/wallets"].includes(item.href)
  ); // Clients, Expenses, Analytics, FIFO, Debts, Capital, Data
  const moreActive = SECONDARY_TABS.some(item =>
    pathname === item.href || pathname.startsWith(item.href)
  ) || pathname.startsWith("/app/settings");

  return (
    <>
    {/* ── MOBILE BOTTOM TAB BAR (md:hidden) ──────────────────────────── */}
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex items-stretch"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {LEFT_TABS.map(item => {
        const isActive = pathname === item.href ||
          (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 active:opacity-60"
            style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}
          >
            <span style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}>{item.icon}</span>
            <span className="text-[10px] leading-none font-medium">{item.label}</span>
          </Link>
        );
      })}

      {/* ── Center: panic-lock button ───────────────────────────────── */}
      {hasPin ? (
        <button
          type="button"
          onClick={lock}
          aria-label="Lock app"
          title="Lock app (matrix password)"
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1 active:opacity-70"
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 44, height: 44,
              backgroundColor: "var(--accent)",
              color: "var(--surface)",
              boxShadow: "0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)",
              marginTop: -14,
              border: "3px solid var(--bg)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <span className="text-[10px] leading-none font-medium" style={{ color: "var(--text-3)" }}>Lock</span>
        </button>
      ) : (
        <Link
          href="/app/settings?tab=security"
          aria-label="Set up matrix password"
          title="Set up matrix password"
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1 active:opacity-70"
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 44, height: 44,
              backgroundColor: "var(--surface)",
              color: "var(--text-3)",
              border: "1px dashed var(--inner-border)",
              marginTop: -14,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0" />
            </svg>
          </span>
          <span className="text-[10px] leading-none font-medium" style={{ color: "var(--text-4)" }}>Set up</span>
        </Link>
      )}

      {RIGHT_TABS.map(item => {
        const isActive = pathname === item.href ||
          (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 active:opacity-60"
            style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}
          >
            <span style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}>{item.icon}</span>
            <span className="text-[10px] leading-none font-medium">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="More"
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2 active:opacity-60"
        style={{ color: moreActive ? "var(--accent)" : "var(--text-3)" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="3" cy="8" r="1.4" fill="currentColor"/>
          <circle cx="8" cy="8" r="1.4" fill="currentColor"/>
          <circle cx="13" cy="8" r="1.4" fill="currentColor"/>
        </svg>
        <span className="text-[10px] leading-none font-medium">More</span>
      </button>
    </nav>

    {/* ── MOBILE "MORE" SHEET (md:hidden) ────────────────────────────── */}
    {mobileOpen && (
      <div className="md:hidden fixed inset-0 z-50">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col max-h-[85vh]"
          style={{
            backgroundColor: "var(--bg)",
            borderTop: "1px solid var(--border)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center py-2.5 shrink-0">
            <span className="block w-10 h-1 rounded-full" style={{ backgroundColor: "var(--text-4)", opacity: 0.4 }} />
          </div>

          {/* Header: org */}
          <div className="px-5 pb-3 flex items-center gap-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <span
              className="flex shrink-0 items-center justify-center rounded-md text-sm font-bold w-8 h-8"
              style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
            >
              ₿
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                {orgName ?? "AccPanel"}
              </p>
              <p className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>{userEmail}</p>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
            {/* Secondary nav */}
            <nav className="grid grid-cols-3 gap-1 px-3 pt-3">
              {SECONDARY_TABS.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg active:opacity-70"
                    style={isActive
                      ? { backgroundColor: "var(--accent-lo)", color: "var(--accent)" }
                      : { backgroundColor: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--surface-lo)" }}
                  >
                    <span style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}>{item.icon}</span>
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Account actions */}
            <div className="border-t mt-4 pt-2 px-2 pb-3" style={{ borderColor: "var(--border)" }}>
              <Link
                href="/app/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm"
                style={pathname.startsWith("/app/settings")
                  ? { backgroundColor: "var(--accent-lo)", color: "var(--accent)" }
                  : { color: "var(--text-2)" }}
              >
                <SettingsIcon /> Settings
              </Link>
              <Link
                href="/app/help"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm"
                style={pathname.startsWith("/app/help")
                  ? { backgroundColor: "var(--accent-lo)", color: "var(--accent)" }
                  : { color: "var(--text-2)" }}
              >
                <HelpIcon /> Help &amp; manual
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm"
                style={{ color: "var(--text-2)" }}
              >
                {theme === "dark" || theme === "amber" || theme === "plum" ? <SunIcon /> : <MoonIcon />}
                Theme · {THEME_NAMES[theme]}
              </button>
              {hasPin && (
                <button
                  type="button"
                  onClick={() => { setMobileOpen(false); lock(); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm"
                  style={{ color: "var(--text-2)" }}
                >
                  <LockIcon /> Lock screen
                </button>
              )}
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm"
                  style={{ color: "var(--red)" }}
                >
                  <SignOutIcon /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── DESKTOP SIDEBAR (md:flex) ──────────────────────────────────── */}
    <aside
      className="hidden md:flex shrink-0 flex-col"
      style={{
        width: collapsed ? 52 : 224,
        transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
        backgroundColor: "var(--bg)",
        borderRight: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Logo / org + collapse toggle */}
      <div
        className="flex h-14 shrink-0 items-center"
        style={{
          borderBottom: "1px solid var(--border)",
          padding: collapsed ? "0 8px" : "0 8px 0 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: collapsed ? 0 : 10,
          transition: "padding 220ms cubic-bezier(0.4,0,0.2,1), gap 220ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Logo mark — fades to zero-width when collapsed */}
        <span
          className="flex shrink-0 items-center justify-center rounded-md text-sm font-bold"
          style={{
            width: collapsed ? 0 : 28,
            height: 28,
            opacity: collapsed ? 0 : 1,
            overflow: "hidden",
            backgroundColor: "var(--accent)",
            color: "var(--surface)",
            transition: "width 220ms cubic-bezier(0.4,0,0.2,1), opacity 150ms ease",
          }}
        >
          ₿
        </span>

        {/* Org name — fades out when collapsed */}
        <div style={textStyle({ minWidth: 0, flex: 1 })}>
          <p className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
            {orgName ?? "AccPanel"}
          </p>
          {orgName && <p className="text-[10px] leading-tight" style={{ color: "var(--text-3)" }}>organisation</p>}
        </div>

        {/* Collapse toggle — always visible, stays right-aligned or centered */}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex shrink-0 items-center justify-center rounded-md"
          style={{
            width: 28, height: 28,
            backgroundColor: "transparent",
            border: "1px solid transparent",
            color: "var(--text-4)",
            transition: "background-color 150ms, border-color 150ms, color 150ms",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.backgroundColor = "var(--raised-hi)";
            el.style.borderColor = "var(--inner-border)";
            el.style.color = "var(--text-2)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.backgroundColor = "transparent";
            el.style.borderColor = "transparent";
            el.style.color = "var(--text-4)";
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{
              transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11 2.5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav
        className="flex flex-1 flex-col gap-px pt-3 overflow-y-auto"
        style={{
          paddingLeft: 8,
          paddingRight: 8,
          // iPad/PWA: kill the rubber-band bounce inside the sidebar so the
          // menu feels anchored when the user pans vertically.
          overscrollBehavior: "none",
          touchAction: "pan-y",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className="flex items-center rounded-md py-[7px] text-sm font-medium transition-all duration-150"
              style={{
                paddingLeft: collapsed ? 0 : 12,
                paddingRight: collapsed ? 0 : 12,
                justifyContent: collapsed ? "center" : "flex-start",
                gap: collapsed ? 0 : 10,
                transition: "padding 220ms cubic-bezier(0.4,0,0.2,1), justify-content 220ms, background-color 0.15s",
                ...(isActive ? {
                  backgroundColor: "var(--accent-lo)",
                  color: "var(--accent)",
                  boxShadow: collapsed ? undefined : "inset 2px 0 0 var(--accent)",
                } : {
                  color: "var(--text-4)",
                }),
              }}
            >
              <span style={{ color: isActive ? "var(--accent)" : "var(--text-3)", transition: "color 0.15s", flexShrink: 0 }}>
                {item.icon}
              </span>
              <span style={textStyle()}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User button + popover */}
      <div
        ref={menuRef}
        className="relative pt-2"
        style={{
          borderTop: "1px solid var(--border)",
          paddingLeft: 8,
          paddingRight: 8,
          // Stay clear of the iOS home indicator when installed as a PWA;
          // 12px on browsers, max(12, safe-area-inset-bottom) on standalone.
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))",
        }}
      >
        {/* Popover menu — opens upward */}
        {menuOpen && (
          <div
            className="absolute left-2 right-2 bottom-full mb-2 z-50 rounded-xl overflow-hidden"
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border-hi)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
              minWidth: 180,
            }}
          >
            {/* Email header */}
            <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--inner-border)" }}>
              <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{userEmail}</p>
            </div>

            {/* Settings */}
            <Link
              href="/app/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              <SettingsIcon />
              Settings
            </Link>

            {/* Help & manual */}
            <Link
              href="/app/help"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              <HelpIcon />
              Help &amp; manual
            </Link>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              {theme === "dark" || theme === "amber" || theme === "plum" ? <SunIcon /> : <MoonIcon />}
              Theme · {THEME_NAMES[theme]}
            </button>

            {/* Lock screen */}
            {hasPin && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); lock(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-2)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <LockIcon />
                Lock screen
              </button>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--inner-border)" }} />

            {/* Sign out */}
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors"
                style={{ color: "var(--red)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.06)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <SignOutIcon />
                Sign out
              </button>
            </form>
          </div>
        )}

        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center rounded-lg transition-colors"
          style={{
            gap: collapsed ? 0 : 10,
            padding: collapsed ? "8px 0" : "8px 10px",
            justifyContent: collapsed ? "center" : "flex-start",
            transition: "padding 220ms cubic-bezier(0.4,0,0.2,1)",
            backgroundColor: menuOpen ? "var(--raised-hi)" : "transparent",
            border: menuOpen ? "1px solid var(--inner-border)" : "1px solid transparent",
          }}
        >
          {/* Avatar */}
          <span
            className="flex shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ width: 28, height: 28, backgroundColor: "var(--raised-hi)", color: "var(--text-2)", border: "1px solid var(--border)" }}
          >
            {initial}
          </span>
          {/* Email + chevron — hidden when collapsed */}
          <span style={textStyle({ display: "flex", alignItems: "center", flex: 1, gap: 4, minWidth: 0 })}>
            <span className="flex-1 text-left truncate text-xs" style={{ color: "var(--text-3)" }}>
              {userEmail}
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              style={{ color: "var(--text-3)", flexShrink: 0, transform: menuOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      </div>
    </aside>
    </>
  );
}
