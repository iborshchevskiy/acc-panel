"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { cashOperations, investors } from "@/db/schema/capital";
import { organizationMembers } from "@/db/schema/system";
import { createClient } from "@/lib/supabase/server";
import { eq, and, ilike, asc } from "drizzle-orm";

async function getOrgId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [m] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!m) redirect("/app/onboarding");
  return m.organizationId;
}

// ── Investor CRUD ────────────────────────────────────────────────────────────

export interface InvestorOption {
  id: string;
  name: string;
  note: string | null;
}

export async function searchInvestors(query: string): Promise<InvestorOption[]> {
  const orgId = await getOrgId();
  const q = query.trim();
  const base = db
    .select({ id: investors.id, name: investors.name, note: investors.note })
    .from(investors)
    .orderBy(asc(investors.name))
    .limit(8);
  const rows = q
    ? await base.where(and(eq(investors.organizationId, orgId), ilike(investors.name, `%${q}%`)))
    : await base.where(eq(investors.organizationId, orgId));
  return rows;
}

export async function createInvestor(name: string, note?: string): Promise<InvestorOption | { error: string }> {
  const orgId = await getOrgId();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  // Prevent duplicate-on-dupe by checking the unique (org, name) pair first
  const [existing] = await db
    .select({ id: investors.id, name: investors.name, note: investors.note })
    .from(investors)
    .where(and(eq(investors.organizationId, orgId), eq(investors.name, trimmed)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(investors)
    .values({ organizationId: orgId, name: trimmed, note: note?.trim() || null })
    .returning({ id: investors.id, name: investors.name, note: investors.note });
  revalidatePath("/app", "layout");
  return row;
}

// ── Cash operation CRUD ──────────────────────────────────────────────────────

export async function addCashOperation(formData: FormData) {
  const orgId = await getOrgId();
  const date = new Date(formData.get("date") as string);
  const investorId = (formData.get("investor_id") as string | null)?.trim() || null;
  const investorName = (formData.get("investor") as string).trim();
  const amount = formData.get("amount") as string;
  const currency = (formData.get("currency") as string).trim().toUpperCase();
  const type = formData.get("type") as string;
  const comment = (formData.get("comment") as string | null)?.trim() || null;

  if (!investorName || !amount || !currency || !type) return;

  // Resolve the investor: prefer explicit investor_id, else look up by name,
  // else create on the fly so legacy typed-only flow still works.
  let resolvedId: string | null = null;
  if (investorId) {
    const [hit] = await db
      .select({ id: investors.id })
      .from(investors)
      .where(and(eq(investors.id, investorId), eq(investors.organizationId, orgId)))
      .limit(1);
    resolvedId = hit?.id ?? null;
  }
  if (!resolvedId) {
    const [byName] = await db
      .select({ id: investors.id })
      .from(investors)
      .where(and(eq(investors.organizationId, orgId), eq(investors.name, investorName)))
      .limit(1);
    if (byName) resolvedId = byName.id;
  }
  if (!resolvedId) {
    const [created] = await db
      .insert(investors)
      .values({ organizationId: orgId, name: investorName })
      .returning({ id: investors.id });
    resolvedId = created.id;
  }

  await db.insert(cashOperations).values({
    organizationId: orgId,
    investorId: resolvedId,
    date,
    investor: investorName,
    amount,
    currency,
    type,
    comment,
  });
  revalidatePath("/app", "layout");
}

export async function deleteCashOperation(id: string) {
  const orgId = await getOrgId();
  await db.delete(cashOperations).where(and(eq(cashOperations.id, id), eq(cashOperations.organizationId, orgId)));
  revalidatePath("/app", "layout");
}
