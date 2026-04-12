import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizationMembers } from "@/db/schema/system";
import { wallets, importTargets } from "@/db/schema/wallets";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const { walletId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 });

  const [row] = await db
    .select({
      syncStatus: importTargets.syncStatus,
      lastSyncAt: importTargets.lastSyncAt,
      txCount: importTargets.txCount,
      lastError: importTargets.lastError,
    })
    .from(importTargets)
    .innerJoin(wallets, eq(wallets.id, importTargets.walletId))
    .where(and(eq(importTargets.walletId, walletId), eq(wallets.organizationId, membership.organizationId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
