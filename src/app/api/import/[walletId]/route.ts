import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizationMembers } from "@/db/schema/system";
import { wallets } from "@/db/schema/wallets";
import { eq, and } from "drizzle-orm";
import { runImport } from "@/lib/import/engine";

export async function POST(
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

  // Verify wallet belongs to org
  const [wallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.organizationId, membership.organizationId)));
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  // Run import (async — don't await, return immediately)
  runImport(walletId, membership.organizationId).catch(console.error);

  return NextResponse.json({ status: "started" });
}
