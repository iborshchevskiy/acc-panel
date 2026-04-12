import { db } from "@/db/client";
import { importTargets, wallets } from "@/db/schema/wallets";
import { eq, desc, sql } from "drizzle-orm";

export default async function AdminHealthPage() {
  const [dbCheck, failedImports, pendingImports] = await Promise.all([
    // DB round-trip check
    db.execute(sql`SELECT 1 AS ok`).then(() => ({ ok: true, latencyMs: 0 })).catch((e) => ({ ok: false, error: String(e) })),

    // Wallets stuck in error state
    db.select({
      walletId: importTargets.walletId,
      address: wallets.address,
      chain: wallets.chain,
      lastError: importTargets.lastError,
      updatedAt: importTargets.updatedAt,
    })
      .from(importTargets)
      .innerJoin(wallets, eq(wallets.id, importTargets.walletId))
      .where(eq(importTargets.syncStatus, "error"))
      .orderBy(desc(importTargets.updatedAt))
      .limit(20),

    // Wallets stuck in running state (possible hung jobs)
    db.select({
      walletId: importTargets.walletId,
      address: wallets.address,
      chain: wallets.chain,
      updatedAt: importTargets.updatedAt,
    })
      .from(importTargets)
      .innerJoin(wallets, eq(wallets.id, importTargets.walletId))
      .where(eq(importTargets.syncStatus, "running"))
      .orderBy(desc(importTargets.updatedAt))
      .limit(10),

  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>System Health</h1>
      </div>

      {/* DB status */}
      <div className="rounded-xl p-4 flex items-center gap-4" style={{ backgroundColor: "#0d0505", border: `1px solid ${dbCheck.ok ? "var(--accent)" : "var(--red)"}44` }}>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dbCheck.ok ? "var(--accent)" : "var(--red)" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>Database</p>
          <p className="text-xs" style={{ color: dbCheck.ok ? "var(--accent)" : "var(--red)" }}>
            {dbCheck.ok ? "Connected" : `Error: ${"error" in dbCheck ? dbCheck.error : "unknown"}`}
          </p>
        </div>
      </div>

      {/* Failed imports */}
      {failedImports.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--red)" }} />
            <h2 className="text-xs font-medium tracking-wide" style={{ color: "var(--red)" }}>FAILED IMPORTS ({failedImports.length})</h2>
          </div>
          <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
            <tbody>
              {failedImports.map((f, i) => (
                <tr key={f.walletId} style={{ borderBottom: i < failedImports.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--indigo)" }}>{f.chain}</td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--text-4)" }}>{f.address.slice(0, 12)}…</td>
                  <td className="px-4 py-2.5 text-xs text-red-400 truncate max-w-xs">{f.lastError}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-3)" }}>{f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stuck imports */}
      {pendingImports.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1a0a0a" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: "#0a0505", borderBottom: "1px solid #1a0a0a" }}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--amber)" }} />
            <h2 className="text-xs font-medium tracking-wide" style={{ color: "var(--amber)" }}>RUNNING IMPORTS ({pendingImports.length})</h2>
          </div>
          <table className="w-full text-sm" style={{ backgroundColor: "var(--bg)" }}>
            <tbody>
              {pendingImports.map((f, i) => (
                <tr key={f.walletId} style={{ borderBottom: i < pendingImports.length - 1 ? "1px solid #1a0a0a" : "none" }}>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--indigo)" }}>{f.chain}</td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "var(--text-4)" }}>{f.address.slice(0, 12)}…</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-3)" }}>since {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {failedImports.length === 0 && pendingImports.length === 0 && (
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--surface-lo)" }}>
          <p className="text-sm" style={{ color: "var(--accent)" }}>All imports healthy</p>
        </div>
      )}
    </div>
  );
}
