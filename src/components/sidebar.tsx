"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  {
    label: "Settings",
    href: "/app/settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.05 3.05l1.06 1.06M10.89 10.89l1.06 1.06M3.05 11.95l1.06-1.06M10.89 4.11l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M7.5 2a5.5 5.5 0 1 0 5.5 5.5A4.5 4.5 0 0 1 7.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface SidebarProps {
  userEmail: string;
  orgName?: string;
}

export default function Sidebar({ userEmail, orgName }: SidebarProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("acc-theme");
    if (stored === "light") {
      setTheme("light");
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      setTheme("dark");
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("acc-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }

  return (
    <aside
      className="flex w-56 shrink-0 flex-col"
      style={{ backgroundColor: "var(--bg)", borderRight: "1px solid var(--border)" }}
    >
      {/* Logo / org */}
      <div className="flex h-14 items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}>
          ₿
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
            {orgName ?? "AccPanel"}
          </p>
          {orgName && <p className="text-[10px] leading-tight" style={{ color: "var(--text-3)" }}>organisation</p>}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-px px-2 pt-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/app/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-[7px] text-sm font-medium transition-all duration-150"
              style={isActive ? {
                backgroundColor: "var(--accent-lo)",
                color: "var(--accent)",
                boxShadow: "inset 2px 0 0 var(--accent)",
              } : {
                color: "var(--text-4)",
              }}
            >
              <span style={{ color: isActive ? "var(--accent)" : "var(--text-3)", transition: "color 0.15s" }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid var(--border)", marginTop: "8px" }}>
        <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="max-w-[118px] truncate text-xs" style={{ color: "var(--text-4)" }}>{userEmail}</span>
            <button
              onClick={toggleTheme}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors"
              style={{ color: "var(--text-3)" }}
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="text-xs transition-colors" style={{ color: "var(--text-3)" }}>
              Sign out →
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
