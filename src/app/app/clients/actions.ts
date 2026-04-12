"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { clients, clientWallets, transactionClients } from "@/db/schema/clients";
import { transactions } from "@/db/schema/transactions";
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

export async function addClient(formData: FormData) {
  const orgId = await getOrgId();
  const name = (formData.get("name") as string).trim();
  const surname = (formData.get("surname") as string | null)?.trim() || null;
  const tgUsername = (formData.get("tg_username") as string | null)?.trim() || null;
  const note = (formData.get("note") as string | null)?.trim() || null;
  if (!name) return;
  await db.insert(clients).values({ organizationId: orgId, name, surname, tgUsername, note });
  revalidatePath("/app/clients");
}

export async function updateClient(clientId: string, formData: FormData) {
  const orgId = await getOrgId();
  const name = (formData.get("name") as string).trim();
  const surname = (formData.get("surname") as string | null)?.trim() || null;
  const tgUsername = (formData.get("tg_username") as string | null)?.trim() || null;
  const note = (formData.get("note") as string | null)?.trim() || null;
  await db.update(clients).set({ name, surname, tgUsername, note, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId)));
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
}

export async function deleteClient(clientId: string) {
  const orgId = await getOrgId();
  await db.delete(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId)));
  redirect("/app/clients");
}

export async function addClientWallet(clientId: string, formData: FormData) {
  await getOrgId();
  const address = (formData.get("address") as string).trim();
  const chain = (formData.get("chain") as string) || "TRON";
  if (!address) return;
  await db.insert(clientWallets).values({ clientId, address, chain });
  revalidatePath(`/app/clients/${clientId}`);
}

export async function removeClientWallet(walletId: string, clientId: string) {
  await getOrgId();
  await db.delete(clientWallets).where(eq(clientWallets.id, walletId));
  revalidatePath(`/app/clients/${clientId}`);
}

export async function assignClient(txId: string, clientId: string) {
  const orgId = await getOrgId();
  const [tx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId))).limit(1);
  if (!tx) return;
  // Upsert: delete existing then insert
  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  await db.insert(transactionClients).values({ transactionId: txId, clientId });
  await db.update(transactions).set({ isMatched: true }).where(eq(transactions.id, txId));
  revalidatePath("/app/transactions");
  revalidatePath(`/app/clients/${clientId}`);
}

export async function unassignClient(txId: string) {
  await getOrgId();
  await db.delete(transactionClients).where(eq(transactionClients.transactionId, txId));
  await db.insert(transactionClients).values({ transactionId: txId, clientId: null });
  revalidatePath("/app/transactions");
}

export async function toggleMatched(txId: string, currentValue: boolean) {
  const orgId = await getOrgId();
  await db.update(transactions).set({ isMatched: !currentValue })
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId)));
  revalidatePath("/app/transactions");
}
