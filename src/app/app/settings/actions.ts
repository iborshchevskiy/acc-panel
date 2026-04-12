"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { organizations, organizationMembers, pendingInvites } from "@/db/schema/system";
import { currencies, orgTransactionTypes } from "@/db/schema/wallets";
import { createClient } from "@/lib/supabase/server";
import { eq, and } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { flashOk, flashErr } from "@/lib/flash";
import { sendInviteEmail } from "@/lib/email";

// cache() deduplicates identical calls within the same request
const getOrgAndUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [m] = await db.select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!m) redirect("/onboarding");
  return { orgId: m.organizationId, role: m.role, userId: user.id, userEmail: user.email ?? "" };
});

export async function updateOrgSettings(formData: FormData) {
  const { orgId, userId, userEmail } = await getOrgAndUser();
  const name = (formData.get("name") as string).trim();
  const baseCurrency = (formData.get("base_currency") as string).trim().toUpperCase();
  const timezone = formData.get("timezone") as string;
  if (!name) flashErr("/app/settings?tab=general", "Organisation name is required.");
  try {
    await db.update(organizations).set({ name, baseCurrency, timezone })
      .where(and(eq(organizations.id, orgId), eq(organizations.isActive, true)));
    await logAudit({ organizationId: orgId, userId, userEmail, action: "org_settings_updated", details: { name, baseCurrency, timezone } });
  } catch {
    flashErr("/app/settings?tab=general", "Failed to save settings.");
  }
  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
  flashOk("/app/settings?tab=general", "Settings saved.");
}

export async function inviteMember(formData: FormData) {
  const { orgId, role: myRole, userId, userEmail } = await getOrgAndUser();
  if (myRole !== "org_admin") flashErr("/app/settings?tab=members", "Only admins can invite members.");

  const email = (formData.get("email") as string).trim().toLowerCase();
  const role = formData.get("role") as string;
  if (!email || !role) flashErr("/app/settings?tab=members", "Email and role are required.");

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.delete(pendingInvites).where(
    and(eq(pendingInvites.organizationId, orgId), eq(pendingInvites.email, email))
  );

  await db.insert(pendingInvites).values({ organizationId: orgId, email, role, token, invitedBy: userId, expiresAt });
  await logAudit({ organizationId: orgId, userId, userEmail, action: "invite_sent", entityType: "invite", details: { email, role } });

  // Send invite email
  await sendInviteEmail({ email, token, orgId, inviterEmail: userEmail });

  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=members", `Invite sent to ${email}`);
}

export async function cancelInvite(formData: FormData) {
  const { orgId, role: myRole, userId, userEmail } = await getOrgAndUser();
  if (myRole !== "org_admin") return;

  const inviteId = formData.get("invite_id") as string;
  await db.delete(pendingInvites).where(
    and(eq(pendingInvites.id, inviteId), eq(pendingInvites.organizationId, orgId))
  );

  await logAudit({ organizationId: orgId, userId, userEmail, action: "invite_cancelled", entityType: "invite", entityId: inviteId });
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=members", "Invite cancelled.");
}

export async function changeMemberRole(formData: FormData) {
  const { orgId, role: myRole, userId, userEmail } = await getOrgAndUser();
  if (myRole !== "org_admin") return;

  const memberId = formData.get("member_id") as string;
  const role = formData.get("role") as string;
  if (!memberId || !role) return;

  // Can't demote yourself
  const [me] = await db.select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);
  if (me?.id === memberId) flashErr("/app/settings?tab=members", "You cannot change your own role.");

  await db.update(organizationMembers).set({ role })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)));

  await logAudit({ organizationId: orgId, userId, userEmail, action: "member_role_changed", entityType: "member", entityId: memberId, details: { role } });
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=members", "Role updated.");
}

export async function removeMember(formData: FormData) {
  const { orgId, role: myRole, userId, userEmail } = await getOrgAndUser();
  if (myRole !== "org_admin") return;

  const memberId = formData.get("member_id") as string;
  if (!memberId) return;

  // Can't remove yourself
  const [me] = await db.select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);
  if (me?.id === memberId) flashErr("/app/settings?tab=members", "You cannot remove yourself.");

  await db.update(organizationMembers).set({ isActive: false })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)));

  await logAudit({ organizationId: orgId, userId, userEmail, action: "member_removed", entityType: "member", entityId: memberId });
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=members", "Member removed.");
}

// ── Currency management ───────────────────────────────────────────────────────

export async function addCurrency(formData: FormData) {
  const { orgId, role } = await getOrgAndUser();
  if (role !== "org_admin") return;

  const code = (formData.get("code") as string).trim().toUpperCase();
  const name = ((formData.get("name") as string) ?? "").trim() || null;
  const type = (formData.get("type") as string) === "fiat" ? "fiat" : "crypto";
  if (!code) flashErr("/app/settings?tab=currencies", "Currency code is required.");

  try {
    await db.insert(currencies).values({ organizationId: orgId, code, name, type });
  } catch {
    flashErr("/app/settings?tab=currencies", `Currency ${code} already exists.`);
  }
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=currencies", `Currency ${code} added.`);
}

export async function editCurrency(formData: FormData) {
  const { orgId, role } = await getOrgAndUser();
  if (role !== "org_admin") return;

  const currencyId = formData.get("currency_id") as string;
  const name = ((formData.get("name") as string) ?? "").trim() || null;
  const type = (formData.get("type") as string) === "fiat" ? "fiat" : "crypto";
  if (!currencyId) return;

  await db.update(currencies).set({ name, type })
    .where(and(eq(currencies.id, currencyId), eq(currencies.organizationId, orgId)));
  revalidatePath("/app/settings");
  revalidatePath("/app/fifo");
  revalidatePath("/app/analytics");
  flashOk("/app/settings?tab=currencies", "Currency updated.");
}

export async function deleteCurrency(formData: FormData) {
  const { orgId, role } = await getOrgAndUser();
  if (role !== "org_admin") return;

  const currencyId = formData.get("currency_id") as string;
  if (!currencyId) return;

  await db.delete(currencies)
    .where(and(eq(currencies.id, currencyId), eq(currencies.organizationId, orgId)));
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=currencies", "Currency deleted.");
}

// ── Transaction type management ───────────────────────────────────────────────

export async function addTransactionType(formData: FormData) {
  const { orgId, role } = await getOrgAndUser();
  if (role !== "org_admin") return;

  const name = (formData.get("name") as string).trim();
  if (!name) flashErr("/app/settings?tab=types", "Type name is required.");

  try {
    await db.insert(orgTransactionTypes).values({ organizationId: orgId, name });
  } catch {
    flashErr("/app/settings?tab=types", `Type "${name}" already exists.`);
  }
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=types", `Type "${name}" added.`);
}

export async function editTransactionType(formData: FormData) {
  const { orgId, role } = await getOrgAndUser();
  if (role !== "org_admin") return;

  const typeId = formData.get("type_id") as string;
  const name = (formData.get("name") as string).trim();
  if (!typeId || !name) return;

  try {
    await db.update(orgTransactionTypes).set({ name })
      .where(and(eq(orgTransactionTypes.id, typeId), eq(orgTransactionTypes.organizationId, orgId)));
  } catch {
    flashErr("/app/settings?tab=types", `Type "${name}" already exists.`);
  }
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=types", `Type updated to "${name}".`);
}

export async function deleteTransactionType(formData: FormData) {
  const { orgId, role } = await getOrgAndUser();
  if (role !== "org_admin") return;

  const typeId = formData.get("type_id") as string;
  if (!typeId) return;

  await db.delete(orgTransactionTypes)
    .where(and(eq(orgTransactionTypes.id, typeId), eq(orgTransactionTypes.organizationId, orgId)));
  revalidatePath("/app/settings");
  flashOk("/app/settings?tab=types", "Transaction type deleted.");
}
