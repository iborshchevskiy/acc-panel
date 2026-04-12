"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { organizations } from "@/db/schema/system";
import { organizationMembers } from "@/db/schema/system";
import { createClient } from "@/lib/supabase/server";
import { eq, and } from "drizzle-orm";

async function getOrgAndUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [m] = await db.select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!m) redirect("/app/onboarding");
  return { orgId: m.organizationId, role: m.role };
}

export async function updateOrgSettings(formData: FormData) {
  const { orgId } = await getOrgAndUser();
  const name = (formData.get("name") as string).trim();
  const baseCurrency = (formData.get("base_currency") as string).trim().toUpperCase();
  const timezone = formData.get("timezone") as string;
  if (!name) return;
  await db.update(organizations).set({ name, baseCurrency, timezone })
    .where(and(eq(organizations.id, orgId), eq(organizations.isActive, true)));
  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
}
