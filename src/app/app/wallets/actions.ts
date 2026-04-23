"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { wallets, importTargets } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { createClient } from "@/lib/supabase/server";
import { eq, and } from "drizzle-orm";

async function getOrgId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);

  if (!membership) redirect("/app/onboarding");
  return membership.organizationId;
}

export async function addWallet(formData: FormData) {
  const orgId = await getOrgId();
  const address = (formData.get("address") as string).trim();
  const label = (formData.get("label") as string | null)?.trim() || null;
  const chain = formData.get("chain") as string;

  if (!address || !chain) return;

  const [wallet] = await db
    .insert(wallets)
    .values({ organizationId: orgId, address, label, chain, isActive: true })
    .returning({ id: wallets.id });

  await db.insert(importTargets).values({ walletId: wallet.id, syncStatus: "idle" });

  revalidatePath("/app", "layout");
}

export async function updateAutoImport(walletId: string, autoImport: boolean, interval: string) {
  const orgId = await getOrgId();

  // Verify ownership
  const [wallet] = await db.select({ id: wallets.id }).from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.organizationId, orgId))).limit(1);
  if (!wallet) return;

  await db.update(importTargets)
    .set({ autoImport, autoImportInterval: interval, updatedAt: new Date() })
    .where(eq(importTargets.walletId, walletId));

  revalidatePath("/app", "layout");
}

export async function updateWalletLabel(walletId: string, label: string) {
  const orgId = await getOrgId();

  await db
    .update(wallets)
    .set({ label: label.trim() || null })
    .where(and(eq(wallets.id, walletId), eq(wallets.organizationId, orgId)));

  revalidatePath("/app", "layout");
}

export async function deleteWallet(walletId: string) {
  const orgId = await getOrgId();

  await db
    .update(wallets)
    .set({ isActive: false })
    .where(and(eq(wallets.id, walletId), eq(wallets.organizationId, orgId)));

  revalidatePath("/app", "layout");
}
