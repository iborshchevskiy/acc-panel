import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { wallets, importTargets } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and } from "drizzle-orm";
import { addWallet, deleteWallet } from "./actions";
import WalletLabelEditor from "./WalletLabelEditor";
import ImportButton from "@/components/import-button";
import ChainPicker from "./ChainPicker";
import AutoImportToggle from "./AutoImportToggle";

const CHAIN_META: Record<string, { label: string; color: string; explorer: (a: string) => string }> = {
  TRON: {
    label: "TRON",
    color: "var(--red)",
    explorer: (a) => `https://tronscan.org/#/address/${a}`,
  },
  ETH: {
    label: "Ethereum",
    color: "var(--indigo)",
    explorer: (a) => `https://etherscan.io/address/${a}`,
  },
  BNB: {
    label: "BNB Chain",
    color: "var(--amber)",
    explorer: (a) => `https://bscscan.com/address/${a}`,
  },
  SOL: {
    label: "Solana",
    color: "var(--accent)",
    explorer: (a) => `https://solscan.io/account/${a}`,
  },
};

export default async function WalletsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);

  if (!membership) redirect("/app/onboarding");

  const rows = await db
    .select({
      id: wallets.id,
      address: wallets.address,
      label: wallets.label,
      chain: wallets.chain,
      syncStatus: importTargets.syncStatus,
      lastSyncAt: importTargets.lastSyncAt,
      txCount: importTargets.txCount,
      autoImport: importTargets.autoImport,
      autoImportInterval: importTargets.autoImportInterval,
    })
    .from(wallets)
    .leftJoin(importTargets, eq(importTargets.walletId, wallets.id))
    .where(and(eq(wallets.organizationId, membership.organizationId), eq(wallets.isActive, true)))
    .orderBy(wallets.createdAt);

  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Wallets</h1>
          <p className="text-sm text-slate-500">{rows.length} wallet{rows.length !== 1 ? "s" : ""} tracked</p>
        </div>
      </div>

      {/* Add wallet form */}
      <form
        action={addWallet}
        className="flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:flex-wrap sm:gap-3 sm:p-4"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}
      >
        <input
          name="address"
          required
          placeholder="Wallet address"
          className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500 sm:flex-1 sm:min-w-48"
        />
        <input
          name="label"
          placeholder="Label (optional)"
          className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500 sm:w-44"
        />
        <div className="flex gap-2 sm:contents">
          <ChainPicker defaultValue="TRON" />
          <button
            type="submit"
            className="h-9 flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none"
            style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
          >
            Add wallet
          </button>
        </div>
      </form>

      {/* Wallet list */}
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-16"
          style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}
        >
          <span className="text-slate-500 text-sm">No wallets yet</span>
          <span className="text-slate-600 text-xs">Add a wallet address above to start tracking</span>
        </div>
      ) : (
       <>
        {/* ── Mobile: card list (no horizontal scrolling) ─────────────── */}
        <div className="flex flex-col gap-2 sm:hidden">
          {rows.map(row => {
            const meta = CHAIN_META[row.chain] ?? CHAIN_META.TRON;
            const explorerUrl = meta.explorer(row.address);
            return (
              <div key={row.id}
                className="rounded-xl p-3 flex flex-col gap-3"
                style={{ backgroundColor: "var(--surface)", border: "1px solid var(--inner-border)" }}>
                {/* Top row: chain badge · address · remove */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold shrink-0"
                    style={{ backgroundColor: meta.color + "22", color: meta.color }}>
                    {meta.label}
                  </span>
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 min-w-0 font-mono text-xs truncate text-center"
                    style={{ color: "var(--text-2)" }} title={row.address}>
                    {row.address.slice(0, 6)}…{row.address.slice(-6)}
                  </a>
                  <form action={deleteWallet.bind(null, row.id)}>
                    <button type="submit"
                      className="text-[11px] px-2 py-1 rounded shrink-0 active:opacity-60"
                      style={{ color: "var(--text-3)" }}>
                      Remove
                    </button>
                  </form>
                </div>

                {/* Label */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider shrink-0" style={{ color: "var(--text-4)" }}>Label</span>
                  <div className="flex-1 min-w-0">
                    <WalletLabelEditor walletId={row.id} initialLabel={row.label} />
                  </div>
                </div>

                {/* Sync action */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider shrink-0" style={{ color: "var(--text-4)" }}>Sync</span>
                  <div className="flex-1 min-w-0">
                    <ImportButton walletId={row.id} initialStatus={row.syncStatus ?? "idle"} />
                  </div>
                </div>

                {/* Auto-import */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-medium uppercase tracking-wider shrink-0" style={{ color: "var(--text-4)" }}>Auto</span>
                  <AutoImportToggle
                    walletId={row.id}
                    initialEnabled={row.autoImport ?? false}
                    initialInterval={row.autoImportInterval ?? "24h"}
                    lastSyncAt={row.lastSyncAt ? row.lastSyncAt.toISOString() : null}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desktop: table ─────────────────────────────────────────── */}
        <div
          className="hidden sm:block overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--inner-border)" }}
        >
         <div className="overflow-x-auto">
          <table className="w-full text-sm sm:table-fixed" style={{ minWidth: 720 }}>
            <colgroup>
              <col className="w-28" />
              <col className="w-44" />
              <col className="w-32" />
              <col />
              <col className="w-64" />
              <col className="w-16" />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Chain</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Label</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500" colSpan={3}>Sync</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Auto-import</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const meta = CHAIN_META[row.chain] ?? CHAIN_META.TRON;
                const explorerUrl = meta.explorer(row.address);
                const isLast = i === rows.length - 1;
                return (
                  <tr
                    key={row.id}
                    style={{
                      backgroundColor: "var(--surface)",
                      borderBottom: isLast ? "none" : "1px solid var(--inner-border)",
                    }}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: meta.color + "22", color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-emerald-400 transition-colors"
                        title={row.address}
                      >
                        {row.address.slice(0, 8)}…{row.address.slice(-6)}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <WalletLabelEditor walletId={row.id} initialLabel={row.label} />
                    </td>
                    <td className="px-4 py-3" colSpan={3}>
                      <ImportButton
                        walletId={row.id}
                        initialStatus={row.syncStatus ?? "idle"}
                      />
                    </td>
                    <td className="px-4 py-3 w-64">
                      <AutoImportToggle
                        walletId={row.id}
                        initialEnabled={row.autoImport ?? false}
                        initialInterval={row.autoImportInterval ?? "24h"}
                        lastSyncAt={row.lastSyncAt ? row.lastSyncAt.toISOString() : null}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteWallet.bind(null, row.id)}>
                        <button
                          type="submit"
                          className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
         </div>
        </div>
       </>
      )}
    </div>
  );
}

