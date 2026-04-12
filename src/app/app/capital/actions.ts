"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { cashOperations } from "@/db/schema/capital";
import { organizationMembers } from "@/db/schema/system";
import { createClient } from "@/lib/supabase/server";
import { eq, and } from "drizzle-orm";

async function getOrgId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [m] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!m) redirect("/app/onboarding");
  return m.organizationId;
}

export async function addCashOperation(formData: FormData) {
  const orgId = await getOrgId();
  const date = new Date(formData.get("date") as string);
  const investor = (formData.get("investor") as string).trim();
  const amount = formData.get("amount") as string;
  const currency = (formData.get("currency") as string).trim().toUpperCase();
  const type = formData.get("type") as string;
  const comment = (formData.get("comment") as string | null)?.trim() || null;
  if (!investor || !amount || !currency || !type) return;
  await db.insert(cashOperations).values({ organizationId: orgId, date, investor, amount, currency, type, comment });
  revalidatePath("/app/capital");
}

export async function deleteCashOperation(id: string) {
  const orgId = await getOrgId();
  await db.delete(cashOperations).where(and(eq(cashOperations.id, id), eq(cashOperations.organizationId, orgId)));
  revalidatePath("/app/capital");
}
