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

// ── Split a transaction into multiple parts ──────────────────────────────────
//
// Use case: a single on-chain payment that, in business terms, is several
// distinct transactions — e.g. one USDT outflow that's part-Exchange with
// Client A and part-Debt repayment to Client B. This action:
//
//   1. Validates that for each (currency, direction) the sum of part amounts
//      equals the original tx's totals (within 1e-9 tolerance).
//   2. Soft-deletes the original.
//   3. Creates N new transactions sharing the original's metadata (timestamp,
//      txHash, chain, fromAddress, toAddress, location, type) and stamped
//      with `splitFromTxId` for audit. Each child gets its own
//      transactionType, comment, status, leg set, and (optional) client.
//
// Returns { success: true } on success, { error: string } on validation/DB
// failure — same shape as updateTransaction so the form can render errors.

interface SplitLeg { direction: "in" | "out" | "fee"; amount: string; currency: string; location?: string | null }
interface SplitPart {
  transactionType: string | null;
  status: string | null;
  comment: string | null;
  clientId: string | null;
  legs: SplitLeg[];
}

export async function splitTransaction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const { orgId, userId, userEmail } = await getOrgContext();
  const txId = formData.get("tx_id") as string | null;
  const partsJson = formData.get("parts_json") as string | null;
  if (!txId || !partsJson) return { error: "Missing tx_id or parts." };

  let parts: SplitPart[];
  try {
    parts = JSON.parse(partsJson) as SplitPart[];
  } catch {
    return { error: "Couldn't parse split parts." };
  }
  if (!Array.isArray(parts) || parts.length < 2) {
    return { error: "Need at least 2 parts to split." };
  }

  // Load the original
  const [orig] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId)))
    .limit(1);
  if (!orig) return { error: "Transaction not found." };
  if (orig.deletedAt) return { error: "Transaction is already deleted." };

  const origLegs = await db.select().from(transactionLegs).where(eq(transactionLegs.transactionId, txId));

  // Build expected per-(direction|currency) totals from the original legs.
  const expected = new Map<string, number>();
  for (const l of origLegs) {
    if (!l.amount || !l.currency) continue;
    const k = `${l.direction}|${l.currency.toUpperCase()}`;
    expected.set(k, (expected.get(k) ?? 0) + Number(l.amount));
  }

  // Sum the parts the same way.
  const got = new Map<string, number>();
  for (const p of parts) {
    for (const leg of p.legs) {
      if (!leg.amount || !leg.currency) continue;
      const amt = Number(leg.amount);
      if (!Number.isFinite(amt)) return { error: `Invalid amount "${leg.amount}".` };
      const k = `${leg.direction}|${leg.currency.toUpperCase()}`;
      got.set(k, (got.get(k) ?? 0) + amt);
    }
  }

  // Compare every key from both sides; any missing/extra/mismatched key fails.
  const TOL = 1e-9;
  const allKeys = new Set([...expected.keys(), ...got.keys()]);
  for (const k of allKeys) {
    const want = expected.get(k) ?? 0;
    const have = got.get(k) ?? 0;
    if (Math.abs(want - have) > TOL) {
      const [dir, cur] = k.split("|");
      return { error: `Sum mismatch for ${dir} ${cur}: parts total ${have}, original was ${want}.` };
    }
  }

  // Currencies referenced by parts must exist in the org. (origLegs already
  // came from the same org, so their currencies are guaranteed; new currency
  // codes can only appear via direct-typing in the form.)
  const partCurrencies = Array.from(new Set(
    parts.flatMap(p => p.legs.map(l => l.currency.toUpperCase()).filter(Boolean))
  ));
  if (partCurrencies.length > 0) await ensureCurrencies(orgId, partCurrencies);

  // Verify every clientId actually belongs to this org before we trust it.
  const clientIds = parts.map(p => p.clientId).filter((x): x is string => !!x);
  const validClientIds = new Set<string>();
  if (clientIds.length > 0) {
    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.organizationId, orgId), inArray(clients.id, clientIds)));
    for (const r of rows) validClientIds.add(r.id);
  }

  // ── All validation passed. Apply the split. ─────────────────────────────
  // Soft-delete original.
  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(and(eq(transactions.id, txId), eq(transactions.organizationId, orgId)));

  // Create child transactions.
  const childIds: string[] = [];
  for (const p of parts) {
    const [child] = await db
      .insert(transactions)
      .values({
        organizationId: orgId,
        txHash: orig.txHash,
        chain: orig.chain,
        type: orig.type,
        transactionType: p.transactionType ?? orig.transactionType,
        timestamp: orig.timestamp,
        fromAddress: orig.fromAddress,
        toAddress: orig.toAddress,
        location: orig.location,
        comment: p.comment ?? null,
        status: p.status ?? orig.status,
        isMatched: !!p.clientId,
        raw: orig.raw,
        splitFromTxId: orig.id,
      })
      .returning({ id: transactions.id });

    childIds.push(child.id);

    // Insert legs for this part.
    if (p.legs.length > 0) {
      await db.insert(transactionLegs).values(
        p.legs.map(l => ({
          transactionId: child.id,
          direction: l.direction,
          amount: l.amount,
          currency: l.currency.toUpperCase(),
          location: l.location ?? null,
        }))
      );
    }

    // Assign client if any & valid. (transactionClients has no organizationId
    // column — the transaction itself is org-scoped, which is enough.)
    if (p.clientId && validClientIds.has(p.clientId)) {
      await db.insert(transactionClients).values({
        transactionId: child.id,
        clientId: p.clientId,
      });
    }
  }

  await logAudit({
    organizationId: orgId, userId, userEmail,
    action: "transaction_split", entityType: "transaction", entityId: txId,
    details: {
      tx: txId.slice(0, 8),
      parts: String(parts.length),
      children: childIds.map(id => id.slice(0, 8)).join(","),
    },
  });

  revalidatePath("/app", "layout");
  return { success: true };
}
