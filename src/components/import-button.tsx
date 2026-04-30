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

  // Friendlier display for known failure modes — the raw error stays
  // in the title attribute so power users can still inspect it.
  const friendlyError = (raw: string | null): string | null => {
    if (!raw) return null;
    if (raw.includes("HELIUS_API_KEY")) return "Solana provider not configured — admin must set HELIUS_API_KEY";
    if (raw.includes("ETHERSCAN_API_KEY")) return "Ethereum provider not configured — admin must set ETHERSCAN_API_KEY";
    if (raw.includes("BSCSCAN_API_KEY")) return "BNB provider not configured — admin must set BSCSCAN_API_KEY";
    if (raw.includes("TRONGRID_API_KEY")) return "TRON provider not configured — admin must set TRONGRID_API_KEY";
    if (raw.includes("Invalid HELIUS_API_KEY") || raw.includes("Invalid ETHERSCAN_API_KEY") || raw.includes("Invalid BSCSCAN_API_KEY")) {
      return "API key invalid — refresh provider key in env";
    }
    if (raw.startsWith("Helius API error:") || raw.startsWith("Etherscan API error:") || raw.startsWith("TronGrid API error:")) {
      return raw; // network / rate-limit messages are fine as-is
    }
    if (raw.length > 80) return raw.slice(0, 77) + "…";
    return raw;
  };
  const errorText = friendlyError(status.lastError);

  return (
    <div className="flex flex-col gap-1.5">
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
      </div>
      {errorText && (
        <span className="text-[11px] text-red-400 leading-snug" title={status.lastError ?? undefined}>
          ⚠ {errorText}
        </span>
      )}
    </div>
  );
}
