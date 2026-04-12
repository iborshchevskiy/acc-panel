"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Reads ?_ok=<message> or ?_err=<message> from the URL, shows a banner,
 * then strips those params from the URL so a refresh doesn't re-show it.
 */
export default function FlashBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shown = useRef(false);

  const ok = searchParams.get("_ok");
  const err = searchParams.get("_err");
  const msg = ok ?? err;

  useEffect(() => {
    if (!msg || shown.current) return;
    shown.current = true;
    // Strip flash params from URL after a tick
    const params = new URLSearchParams(searchParams.toString());
    params.delete("_ok");
    params.delete("_err");
    const next = params.toString() ? `?${params.toString()}` : window.location.pathname;
    setTimeout(() => router.replace(next, { scroll: false }), 2500);
  }, [msg, searchParams, router]);

  if (!msg) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-2xl transition-all"
      style={ok
        ? { backgroundColor: "var(--green-chip-bg)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--accent)" }
        : { backgroundColor: "var(--red-chip-bg)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--red)" }}>
      <span>{ok ? "✓" : "✗"}</span>
      <span>{msg}</span>
    </div>
  );
}
