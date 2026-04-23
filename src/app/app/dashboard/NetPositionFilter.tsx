"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

export default function NetPositionFilter({ asOf }: { asOf: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  function navigate(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) {
      params.set("asOf", value);
    } else {
      params.delete("asOf");
    }
    router.push(`/app/dashboard?${params.toString()}`);
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--inner-border)",
    color: "var(--text-2)",
    borderRadius: 6,
    padding: "2px 7px",
    fontSize: 11,
    outline: "none",
    colorScheme: "dark",
    fontFamily: "var(--font-ibm-plex-mono), monospace",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px]" style={{ color: "var(--text-4)" }}>as of</span>
      <input
        ref={inputRef}
        type="datetime-local"
        defaultValue={asOf}
        style={inputStyle}
        onChange={(e) => navigate(e.target.value)}
      />
      {asOf && (
        <button
          type="button"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            navigate("");
          }}
          className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{ color: "var(--text-4)", border: "1px solid var(--inner-border)" }}
        >
          now
        </button>
      )}
    </div>
  );
}
