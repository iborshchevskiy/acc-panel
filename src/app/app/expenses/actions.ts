"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { clients, transactionClients } from "@/db/schema/clients";
import { organizationMembers } from "@/db/schema/system";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrencies } from "@/lib/currencies";
import { logAudit } from "@/lib/audit";

async function getOrgContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [m] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);
  if (!m) redirect("/onboarding");
  return { orgId: m.organizationId, userId: user.id, userEmail: user.email ?? undefined };
}

export async function createExpense(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const { orgId, userId, userEmail } = await getOrgContext();

  const dateStr = formData.get("date") as string;
  const amount = (formData.get("amount") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim().toUpperCase();
  const account = (formData.get("account") as string)?.trim() || null;
  const comment = (formData.get("comment") as string)?.trim() || null;
  const clientId = (formData.get("client_id") as string)?.trim() || null;
  const clientCreateName = (formData.get("client_create_name") as string)?.trim() || null;
  const clientCreateSurname = (formData.get("client_create_surname") as string)?.trim() || null;

  if (!dateStr) return { error: "Date is required." };
  const timestamp = new Date(dateStr);
  if (isNaN(timestamp.getTime())) return { error: "Invalid date." };
  if (!amount || !currency) return { error: "Amount and currency are required." };

  const [tx] = await db.insert(transactions).values({
    organizationId: orgId,
    type: "Manual",
    transactionType: "Expense",
    timestamp,
    comment,
    isMatched: true,
  }).returning({ id: transactions.id });

  await db.insert(transactionLegs).values({
    transactionId: tx.id,
    direction: "out",
    amount,
    currency,
    location: account,
  });
  await ensureCurrencies(orgId, [currency]);

  if (clientId) {
    await db.insert(transactionClients).values({ transactionId: tx.id, clientId });
  } else if (clientCreateName) {
    const [newClient] = await db.insert(clients).values({
      organizationId: orgId,
      name: clientCreateName,
      surname: clientCreateSurname,
    }).returning({ id: clients.id });
    await db.insert(transactionClients).values({ transactionId: tx.id, clientId: newClient.id });
    revalidatePath("/app/clients");
  }

  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "transaction_created", entityType: "transaction", entityId: tx.id,
    details: { type: "Expense", legs: `-${amount} ${currency}${account ? ` (${account})` : ""}`, ...(comment ? { comment } : {}) },
  });
  revalidatePath("/app/expenses");
  revalidatePath("/app/transactions");
  return { success: true };
}
