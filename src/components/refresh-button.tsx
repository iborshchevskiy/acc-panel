"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 800);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Refresh data"
      className="h-8 flex items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors"
      style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)", color: "var(--text-2)" }}
    >
      <svg
        width="12" height="12" viewBox="0 0 12 12" fill="none"
        style={{ transform: spinning ? "rotate(360deg)" : undefined, transition: spinning ? "transform 0.7s linear" : undefined }}
      >
        <path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 2.83 1.17L10 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10 1v3H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Refresh
    </button>
  );
}
