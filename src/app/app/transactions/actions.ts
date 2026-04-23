"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { clients, transactionClients } from "@/db/schema/clients";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrencies } from "@/lib/currencies";
import { logAudit } from "@/lib/audit";

async function getOrgContext(): Promise<{ orgId: string; userId: string; userEmail: string | undefined }> {
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

async function getOrgId(): Promise<string> {
  return (await getOrgContext()).orgId;
}

export async function updateTransaction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const { orgId, userId, userEmail } = await getOrgContext();
  const txId = formData.get("tx_id") as string;
  if (!txId) return { error: "Missing transaction ID." };

  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return { error: "Transaction not found." };

  const dateStr = formData.get("date") as string;
  const transactionType = (formData.get("transaction_type") as string)?.trim() || null;
  const comment = (formData.get("comment") as string)?.trim() || null;
  const status = (formData.get("status") as string)?.trim() || null;

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

  const txHash = (formData.get("tx_hash") as string)?.trim() || null;

  await db.update(transactions)
    .set({ transactionType, timestamp, comment, status, txHash })
    .where(eq(transactions.id, txId));

  await db.delete(transactionLegs).where(eq(transactionLegs.transactionId, txId));
  await db.insert(transactionLegs).values(
    legs.map((l) => ({ transactionId: txId, direction: l.direction, amount: l.amount, currency: l.currency, location: l.location }))
  );
  await ensureCurrencies(orgId, legs.map((l) => l.currency));

  const legSummary = legs.map(l => `${l.direction === "in" ? "+" : "-"}${l.amount} ${l.currency}${l.location ? ` (${l.location})` : ""}`).join(" / ");
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "transaction_updated", entityType: "transaction", entityId: txId,
    details: {
      tx: txId.slice(0, 8),
      type: transactionType ?? "—",
      legs: legSummary,
      ...(comment ? { comment } : {}),
    },
  });
  revalidatePath("/app", "layout");
  return { success: true };
}

export async function createManualTransaction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const { orgId, userId, userEmail } = await getOrgContext();

  const dateStr = formData.get("date") as string;
  const transactionType = (formData.get("transaction_type") as string)?.trim() || null;
  const comment = (formData.get("comment") as string)?.trim() || null;
  const status = (formData.get("status") as string)?.trim() || null;

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
    status,
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
    revalidatePath("/app", "layout");
  }

  const legSummary = legs.map(l => `${l.direction === "in" ? "+" : "-"}${l.amount} ${l.currency}${l.location ? ` (${l.location})` : ""}`).join(" / ");
  const clientLabel = clientId
    ? `id:${clientId.slice(0, 8)}`
    : clientCreateName
    ? `new: ${clientCreateName}${clientCreateSurname ? " " + clientCreateSurname : ""}`
    : undefined;
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "transaction_created", entityType: "transaction", entityId: tx.id,
    details: {
      type: transactionType ?? "—",
      legs: legSummary,
      ...(comment ? { comment } : {}),
      ...(clientLabel ? { client: clientLabel } : {}),
    },
  });
  revalidatePath("/app", "layout");
  return { success: true };
}

export async function assignClient(txId: string, clientId: string): Promise<void> {
  const orgId = await getOrgId();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;

  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  await db.insert(transactionClients).values({ transactionId: txId, clientId });
  revalidatePath("/app", "layout");
}

export async function unassignClient(txId: string): Promise<void> {
  const orgId = await getOrgId();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;

  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  revalidatePath("/app", "layout");
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

  revalidatePath("/app", "layout");
  return newClient;
}

export async function bulkSetType(txIds: string[], type: string | null): Promise<void> {
  const { orgId, userId, userEmail } = await getOrgContext();
  if (!txIds.length) return;

  // Verify ownership
  const owned = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.organizationId, orgId), inArray(transactions.id, txIds)));
  const ownedIds = owned.map((r) => r.id);
  if (!ownedIds.length) return;

  await db.update(transactions).set({ transactionType: type }).where(inArray(transactions.id, ownedIds));
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "bulk_type_set", entityType: "transaction",
    details: { count: String(ownedIds.length), type: type ?? "cleared" },
  });
  revalidatePath("/app", "layout");
}

export async function bulkAssignClient(txIds: string[], clientId: string): Promise<void> {
  const { orgId, userId, userEmail } = await getOrgContext();
  if (!txIds.length) return;

  const owned = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.organizationId, orgId), inArray(transactions.id, txIds)));
  const ownedIds = owned.map((r) => r.id);
  if (!ownedIds.length) return;

  // Verify client belongs to org
  const [client] = await db.select({ id: clients.id, name: clients.name, surname: clients.surname })
    .from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId))).limit(1);
  if (!client) return;

  for (const txId of ownedIds) {
    await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
    await db.insert(transactionClients).values({ transactionId: txId, clientId });
  }
  const clientName = `${client.name}${client.surname ? " " + client.surname : ""}`;
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "bulk_client_assigned", entityType: "transaction",
    details: { count: String(ownedIds.length), client: clientName },
  });
  revalidatePath("/app", "layout");
}

export async function bulkDelete(txIds: string[]): Promise<void> {
  const { orgId, userId, userEmail } = await getOrgContext();
  if (!txIds.length) return;

  const owned = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.organizationId, orgId), inArray(transactions.id, txIds)));
  const ownedIds = owned.map((r) => r.id);
  if (!ownedIds.length) return;

  await db.update(transactions).set({ deletedAt: new Date() }).where(inArray(transactions.id, ownedIds));
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "bulk_deleted", entityType: "transaction",
    details: { count: String(ownedIds.length) },
  });
  revalidatePath("/app", "layout");
}

export async function updateLeg(legId: string, amount: string, currency: string, location: string): Promise<void> {
  const { orgId } = await getOrgContext();

  // Verify ownership through the parent transaction
  const [leg] = await db
    .select({ transactionId: transactionLegs.transactionId })
    .from(transactionLegs)
    .where(eq(transactionLegs.id, legId))
    .limit(1);
  if (!leg) return;

  const [tx] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, leg.transactionId), eq(transactions.organizationId, orgId)))
    .limit(1);
  if (!tx) return;

  const trimmedCurrency = currency.trim().toUpperCase() || null;
  await db.update(transactionLegs)
    .set({
      amount: amount.trim() || null,
      currency: trimmedCurrency,
      location: location.trim() || null,
    })
    .where(eq(transactionLegs.id, legId));

  if (trimmedCurrency) await ensureCurrencies(orgId, [trimmedCurrency]);
  revalidatePath("/app", "layout");
}

export async function createLeg(txId: string, direction: string, amount: string, currency: string, location: string): Promise<string | null> {
  const { orgId } = await getOrgContext();

  // Verify ownership
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return null;

  const trimmedCurrency = currency.trim().toUpperCase() || null;
  const [leg] = await db.insert(transactionLegs).values({
    transactionId: txId,
    direction,
    amount: amount.trim() || null,
    currency: trimmedCurrency,
    location: location.trim() || null,
  }).returning({ id: transactionLegs.id });

  if (trimmedCurrency) await ensureCurrencies(orgId, [trimmedCurrency]);
  revalidatePath("/app", "layout");
  return leg?.id ?? null;
}

export async function setTransactionType(txId: string, type: string | null): Promise<void> {
  const { orgId } = await getOrgContext();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;
  await db.update(transactions).set({ transactionType: type }).where(eq(transactions.id, txId));
  revalidatePath("/app", "layout");
}

export async function setTransactionStatus(txId: string, status: string | null): Promise<void> {
  const { orgId } = await getOrgContext();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;
  await db.update(transactions).set({ status }).where(eq(transactions.id, txId));
  revalidatePath("/app", "layout");
}

export async function bulkSetStatus(txIds: string[], status: string | null): Promise<void> {
  const { orgId, userId, userEmail } = await getOrgContext();
  if (!txIds.length) return;

  const owned = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.organizationId, orgId), inArray(transactions.id, txIds)));
  const ownedIds = owned.map((r) => r.id);
  if (!ownedIds.length) return;

  await db.update(transactions).set({ status }).where(inArray(transactions.id, ownedIds));
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "bulk_status_set", entityType: "transaction",
    details: { count: String(ownedIds.length), status: status ?? "cleared" },
  });
  revalidatePath("/app", "layout");
}

export async function deleteTransaction(formData: FormData) {
  const { orgId, userId, userEmail } = await getOrgContext();
  const txId = formData.get("tx_id") as string;
  if (!txId) return;

  // Fetch before deleting so we can log details
  const [txRow] = await db.select({ transactionType: transactions.transactionType, comment: transactions.comment, timestamp: transactions.timestamp })
    .from(transactions).where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  const txLegs = txRow ? await db.select().from(transactionLegs).where(eq(transactionLegs.transactionId, txId)) : [];

  // Soft delete — never hard-delete financial records
  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId)));

  const legSummary = txLegs.map(l => `${l.direction === "in" ? "+" : "-"}${l.amount} ${l.currency}`).join(" / ");
  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "transaction_deleted", entityType: "transaction", entityId: txId,
    details: {
      tx: txId.slice(0, 8),
      type: txRow?.transactionType ?? "—",
      legs: legSummary || "—",
      date: txRow?.timestamp ? new Date(txRow.timestamp).toISOString().slice(0, 10) : "—",
      ...(txRow?.comment ? { comment: txRow.comment } : {}),
    },
  });
  revalidatePath("/app", "layout");
}
