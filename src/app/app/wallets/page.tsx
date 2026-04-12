import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { wallets, importTargets } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and } from "drizzle-orm";
import { addWallet, deleteWallet } from "./actions";
import ImportButton from "@/components/import-button";

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
    })
    .from(wallets)
    .leftJoin(importTargets, eq(importTargets.walletId, wallets.id))
    .where(and(eq(wallets.organizationId, membership.organizationId), eq(wallets.isActive, true)))
    .orderBy(wallets.createdAt);

  return (
    <div className="flex flex-col gap-6 p-6">
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
        className="flex flex-wrap gap-3 rounded-xl p-4"
        style={{ backgroundColor: "var(--raised-hi)", border: "1px solid var(--inner-border)" }}
      >
        <input
          name="address"
          required
          placeholder="Wallet address"
          className="h-9 flex-1 min-w-48 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <input
          name="label"
          placeholder="Label (optional)"
          className="h-9 w-44 rounded-md bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <select
          name="chain"
          required
          defaultValue="TRON"
          className="h-9 rounded-md bg-white/5 px-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
          style={{ backgroundColor: "var(--inner-border)" }}
        >
          <option value="TRON">TRON</option>
          <option value="ETH">Ethereum</option>
          <option value="BNB">BNB Chain</option>
          <option value="SOL">Solana</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md px-4 text-sm font-medium transition-colors"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
        >
          Add wallet
        </button>
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
        <div
          className="overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--inner-border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--raised-hi)", borderBottom: "1px solid var(--inner-border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Chain</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Label</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500" colSpan={3}>Sync</th>
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
                    <td className="px-4 py-3 text-slate-400">
                      {row.label ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3" colSpan={3}>
                      <ImportButton
                        walletId={row.id}
                        initialStatus={row.syncStatus ?? "idle"}
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
      )}
    </div>
  );
}

