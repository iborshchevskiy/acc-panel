"use client";

import { useState, useEffect, useCallback } from "react";

interface Status {
  syncStatus: "idle" | "running" | "done" | "error";
  txCount: number | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  idle: "var(--text-2)",
  running: "var(--amber)",
  done: "var(--accent)",
  error: "var(--red)",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Syncing…",
  done: "Done",
  error: "Error",
};

export default function ImportButton({ walletId, initialStatus }: { walletId: string; initialStatus: string }) {
  const [status, setStatus] = useState<Status>({
    syncStatus: initialStatus as Status["syncStatus"],
    txCount: null,
    lastSyncAt: null,
    lastError: null,
  });
  const [loading, setLoading] = useState(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/import/${walletId}/status`);
    if (res.ok) {
      const data = await res.json() as Status;
      setStatus(data);
      return data.syncStatus;
    }
    return "idle";
  }, [walletId]);

  // Poll while running
  useEffect(() => {
    if (status.syncStatus !== "running") return;
    const id = setInterval(async () => {
      const s = await poll();
      if (s !== "running") clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [status.syncStatus, poll]);

  async function startImport() {
    setLoading(true);
    await fetch(`/api/import/${walletId}`, { method: "POST" });
    setStatus((s) => ({ ...s, syncStatus: "running" }));
    setLoading(false);
  }

  const color = STATUS_COLORS[status.syncStatus] ?? "var(--text-2)";
  const label = STATUS_LABELS[status.syncStatus] ?? status.syncStatus;

  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
        {status.txCount != null && status.syncStatus === "done" && (
          <span className="text-slate-600 ml-1">({status.txCount} txs)</span>
        )}
      </span>
      <button
        onClick={startImport}
        disabled={loading || status.syncStatus === "running"}
        className="h-7 rounded px-2.5 text-xs font-medium transition-colors disabled:opacity-40"
        style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}
      >
        {status.syncStatus === "running" ? "Syncing…" : "Import"}
      </button>
      {status.lastError && (
        <span className="text-xs text-red-400" title={status.lastError}>⚠ Error</span>
      )}
    </div>
  );
}
