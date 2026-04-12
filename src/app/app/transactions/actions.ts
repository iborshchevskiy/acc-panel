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

async function getOrgId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [m] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);
  if (!m) redirect("/onboarding");
  return m.organizationId;
}

export async function updateTransaction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const orgId = await getOrgId();
  const txId = formData.get("tx_id") as string;
  if (!txId) return { error: "Missing transaction ID." };

  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return { error: "Transaction not found." };

  const dateStr = formData.get("date") as string;
  const transactionType = (formData.get("transaction_type") as string)?.trim() || null;
  const comment = (formData.get("comment") as string)?.trim() || null;

  if (!dateStr) return { error: "Date is required." };
  const timestamp = new Date(dateStr);
  if (isNaN(timestamp.getTime())) return { error: "Invalid date." };

  const inAmounts = formData.getAll("in_amount") as string[];
  const inCurrencies = formData.getAll("in_currency") as string[];
  const inLocations = formData.getAll("in_location") as string[];
  const outAmounts = formData.getAll("out_amount") as string[];
  const outCurrencies = formData.getAll("out_currency") as string[];
  const outLocations = formData.getAll("out_location") as string[];

  const legs: { direction: "in" | "out"; amount: string; currency: string; location: string | null }[] = [];
  for (let i = 0; i < inAmounts.length; i++) {
    const amt = inAmounts[i]?.trim();
    const cur = inCurrencies[i]?.trim().toUpperCase();
    if (amt && cur) legs.push({ direction: "in", amount: amt, currency: cur, location: inLocations[i]?.trim() || null });
  }
  for (let i = 0; i < outAmounts.length; i++) {
    const amt = outAmounts[i]?.trim();
    const cur = outCurrencies[i]?.trim().toUpperCase();
    if (amt && cur) legs.push({ direction: "out", amount: amt, currency: cur, location: outLocations[i]?.trim() || null });
  }

  if (legs.length === 0) return { error: "Add at least one leg with amount and currency." };

  await db.update(transactions)
    .set({ transactionType, timestamp, comment })
    .where(eq(transactions.id, txId));

  await db.delete(transactionLegs).where(eq(transactionLegs.transactionId, txId));
  await db.insert(transactionLegs).values(
    legs.map((l) => ({ transactionId: txId, direction: l.direction, amount: l.amount, currency: l.currency, location: l.location }))
  );
  await ensureCurrencies(orgId, legs.map((l) => l.currency));

  revalidatePath("/app/transactions");
  return { success: true };
}

export async function createManualTransaction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const orgId = await getOrgId();

  const dateStr = formData.get("date") as string;
  const transactionType = (formData.get("transaction_type") as string)?.trim() || null;
  const comment = (formData.get("comment") as string)?.trim() || null;

  if (!dateStr) return { error: "Date is required." };
  const timestamp = new Date(dateStr);
  if (isNaN(timestamp.getTime())) return { error: "Invalid date." };

  const inAmounts = formData.getAll("in_amount") as string[];
  const inCurrencies = formData.getAll("in_currency") as string[];
  const inLocations = formData.getAll("in_location") as string[];
  const outAmounts = formData.getAll("out_amount") as string[];
  const outCurrencies = formData.getAll("out_currency") as string[];
  const outLocations = formData.getAll("out_location") as string[];

  const legs: { direction: "in" | "out"; amount: string; currency: string; location: string | null }[] = [];
  for (let i = 0; i < inAmounts.length; i++) {
    const amt = inAmounts[i]?.trim();
    const cur = inCurrencies[i]?.trim().toUpperCase();
    if (amt && cur) legs.push({ direction: "in", amount: amt, currency: cur, location: inLocations[i]?.trim() || null });
  }
  for (let i = 0; i < outAmounts.length; i++) {
    const amt = outAmounts[i]?.trim();
    const cur = outCurrencies[i]?.trim().toUpperCase();
    if (amt && cur) legs.push({ direction: "out", amount: amt, currency: cur, location: outLocations[i]?.trim() || null });
  }

  if (legs.length === 0) return { error: "Add at least one leg with amount and currency." };

  const [tx] = await db.insert(transactions).values({
    organizationId: orgId,
    type: "Manual",
    transactionType,
    timestamp,
    comment,
    isMatched: true,
  }).returning({ id: transactions.id });

  await db.insert(transactionLegs).values(
    legs.map(l => ({ transactionId: tx.id, direction: l.direction, amount: l.amount, currency: l.currency, location: l.location }))
  );
  await ensureCurrencies(orgId, legs.map(l => l.currency));

  // Client assignment
  const clientId = (formData.get("client_id") as string)?.trim();
  const clientCreateName = (formData.get("client_create_name") as string)?.trim();
  const clientCreateSurname = (formData.get("client_create_surname") as string)?.trim() || null;

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

  revalidatePath("/app/transactions");
  return { success: true };
}

export async function assignClient(txId: string, clientId: string): Promise<void> {
  const orgId = await getOrgId();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;

  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  await db.insert(transactionClients).values({ transactionId: txId, clientId });
  revalidatePath("/app/transactions");
}

export async function unassignClient(txId: string): Promise<void> {
  const orgId = await getOrgId();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;

  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  revalidatePath("/app/transactions");
}

export async function createAndAssignClient(
  txId: string,
  name: string,
  surname: string | null,
): Promise<{ id: string; name: string; surname: string | null; tgUsername: string | null } | null> {
  const orgId = await getOrgId();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return null;

  const [newClient] = await db.insert(clients).values({
    organizationId: orgId,
    name: name.trim(),
    surname: surname?.trim() || null,
  }).returning({
    id: clients.id,
    name: clients.name,
    surname: clients.surname,
    tgUsername: clients.tgUsername,
  });

  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  await db.insert(transactionClients).values({ transactionId: txId, clientId: newClient.id });

  revalidatePath("/app/transactions");
  revalidatePath("/app/clients");
  return newClient;
}

export async function deleteTransaction(formData: FormData) {
  const orgId = await getOrgId();
  const txId = formData.get("tx_id") as string;
  if (!txId) return;

  // Soft delete — never hard-delete financial records
  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId)));

  revalidatePath("/app/transactions");
}
