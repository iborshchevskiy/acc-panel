"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { clients, clientWallets, clientDocuments, transactionClients } from "@/db/schema/clients";
import { transactions } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { eq, and } from "drizzle-orm";

const DOCS_BUCKET = "client-docs";

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

export async function updateClientKyc(clientId: string, formData: FormData) {
  const orgId = await getOrgId();
  const str = (k: string) => (formData.get(k) as string | null)?.trim() || null;
  await db.update(clients).set({
    dateOfBirth:   str("date_of_birth"),
    sex:           str("sex"),
    address:       str("address"),
    phone:         str("phone"),
    email:         str("email"),
    sourceOfFunds: str("source_of_funds"),
    sourceOfWealth: str("source_of_wealth"),
    updatedAt: new Date(),
  }).where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId)));
  revalidatePath(`/app/clients/${clientId}`);
}

export async function uploadClientDocument(
  clientId: string,
  docType: string,
  formData: FormData
): Promise<{ error?: string }> {
  const orgId = await getOrgId();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > 20 * 1024 * 1024) return { error: "File too large (max 20 MB)" };

  const ext = file.name.split(".").pop() ?? "bin";
  const storageKey = `${orgId}/${clientId}/${docType}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  // Ensure bucket exists (no-op if it already does)
  await admin.storage.createBucket(DOCS_BUCKET, { public: false }).catch(() => {});

  const bytes = await file.arrayBuffer();
  const { error } = await admin.storage.from(DOCS_BUCKET).upload(storageKey, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return { error: error.message };

  await db.insert(clientDocuments).values({
    clientId,
    organizationId: orgId,
    docType,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || null,
    storageKey,
  });
  revalidatePath(`/app/clients/${clientId}`);
  return {};
}

export async function deleteClientDocument(docId: string, clientId: string) {
  const orgId = await getOrgId();
  const [doc] = await db.select().from(clientDocuments)
    .where(and(eq(clientDocuments.id, docId), eq(clientDocuments.organizationId, orgId)));
  if (!doc) return;

  const admin = createAdminClient();
  await admin.storage.from(DOCS_BUCKET).remove([doc.storageKey]);
  await db.delete(clientDocuments).where(eq(clientDocuments.id, docId));
  revalidatePath(`/app/clients/${clientId}`);
}

export async function getDocumentSignedUrl(docId: string): Promise<string | null> {
  const orgId = await getOrgId();
  const [doc] = await db.select().from(clientDocuments)
    .where(and(eq(clientDocuments.id, docId), eq(clientDocuments.organizationId, orgId)));
  if (!doc) return null;

  const admin = createAdminClient();
  const { data } = await admin.storage.from(DOCS_BUCKET).createSignedUrl(doc.storageKey, 3600);
  return data?.signedUrl ?? null;
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
