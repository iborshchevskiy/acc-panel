"use client";

import { useState, useRef } from "react";

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: number;
  message?: string;
}

export default function DataImport() {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState("uploading");
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/import/csv", { method: "POST", body: formData });
    const data = await res.json() as ImportResult;

    if (res.ok) {
      setResult(data);
      setState("done");
    } else {
      setResult(data);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
          style={{ backgroundColor: "#1e2432", color: "#94a3b8" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 9V1M4 4l3-3 3 3M2 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {fileRef.current?.files?.[0]?.name ?? "Choose file"}
          <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
            onChange={() => { setState("idle"); setResult(null); }} />
        </label>
        <button type="submit" disabled={state === "uploading"}
          className="h-9 rounded-md px-4 text-sm font-medium disabled:opacity-40 transition-colors"
          style={{ backgroundColor: "#10b981", color: "#0d1117" }}>
          {state === "uploading" ? "Importing…" : "Import"}
        </button>
      </form>

      {state === "done" && result && (
        <div className="rounded-md px-4 py-3 text-sm" style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <span className="text-emerald-400">✓ Import complete</span>
          <span className="ml-2 text-slate-500">
            {result.inserted} inserted · {result.skipped} skipped · {result.errors} errors
          </span>
        </div>
      )}
      {state === "error" && result && (
        <div className="rounded-md px-4 py-3 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <span className="text-red-400">✗ Import failed</span>
          {result.message && <span className="ml-2 text-slate-500">{result.message}</span>}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Accepts v1-compatible semicolon CSV or JSON. Existing TxIDs are skipped (idempotent).
      </p>
    </div>
  );
}
