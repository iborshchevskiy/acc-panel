"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "var(--surface)" }}>
      <p className="font-[family-name:var(--font-ibm-plex-mono)] text-6xl font-medium text-slate-700">500</p>
      <p className="text-slate-400">Something went wrong</p>
      {error.message && (
        <p className="max-w-md text-center text-xs text-slate-600 font-mono">{error.message}</p>
      )}
      <button onClick={reset}
        className="mt-2 h-8 flex items-center rounded-md px-4 text-sm font-medium"
        style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>
        Try again
      </button>
    </div>
  );
}
