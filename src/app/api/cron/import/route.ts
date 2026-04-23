import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { wallets, importTargets } from "@/db/schema/wallets";
import { eq, and } from "drizzle-orm";
import { runImport } from "@/lib/import/engine";

// Allow up to 5 minutes for the cron to finish all due imports.
// Set this in Vercel Project Settings → Functions → maxDuration if needed.
export const maxDuration = 300;

function parseIntervalMs(v: string): number {
  const m = v.match(/^(\d+)(h|d)$/);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = parseInt(m[1]);
  return m[2] === "d" ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
}

export async function GET(req: NextRequest) {
  // Vercel sends CRON_SECRET automatically; require it if set
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const targets = await db
    .select({
      walletId: importTargets.walletId,
      syncStatus: importTargets.syncStatus,
      lastSyncAt: importTargets.lastSyncAt,
      autoImportInterval: importTargets.autoImportInterval,
      organizationId: wallets.organizationId,
    })
    .from(importTargets)
    .innerJoin(wallets, eq(wallets.id, importTargets.walletId))
    .where(and(
      eq(importTargets.autoImport, true),
      eq(wallets.isActive, true),
    ));

  const due = targets.filter((t) => {
    if (t.syncStatus === "running") return false;
    if (!t.lastSyncAt) return true; // never synced → always due
    const intervalMs = parseIntervalMs(t.autoImportInterval ?? "24h");
    return now.getTime() - new Date(t.lastSyncAt).getTime() >= intervalMs;
  });

  if (due.length === 0) {
    return NextResponse.json({ triggered: 0, checked: targets.length });
  }

  // Run all due imports in parallel and wait for them all to finish.
  // This is critical — fire-and-forget in a serverless function is unreliable
  // because the function can be killed the moment the response is sent.
  const results = await Promise.allSettled(
    due.map((t) => runImport(t.walletId, t.organizationId))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed    = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({
    triggered: due.length,
    checked: targets.length,
    succeeded,
    failed,
  });
}
