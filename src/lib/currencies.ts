/**
 * Ensures currencies exist for an org. Called from import paths.
 * Uses batch upsert — silently ignores duplicates.
 */
import { db } from "@/db/client";
import { currencies } from "@/db/schema/wallets";
import { and, eq, inArray } from "drizzle-orm";

const KNOWN_FIAT = new Set(["EUR", "USD", "CZK", "PLN", "GBP", "UAH", "RUB", "HUF", "RON", "CHF", "SEK", "NOK", "DKK", "CAD", "AUD", "JPY", "CNY"]);

export async function ensureCurrencies(orgId: string, codes: string[]): Promise<void> {
  if (!orgId || !codes.length) return;

  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (!unique.length) return;

  // Check which ones already exist in a single query
  const existing = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(and(eq(currencies.organizationId, orgId), inArray(currencies.code, unique)));

  const existingSet = new Set(existing.map((r) => r.code));
  const toInsert = unique.filter((c) => !existingSet.has(c));
  if (!toInsert.length) return;

  try {
    await db.insert(currencies).values(
      toInsert.map((code) => ({
        organizationId: orgId,
        code,
        type: KNOWN_FIAT.has(code) ? ("fiat" as const) : ("crypto" as const),
      }))
    ).onConflictDoNothing();
  } catch {
    // Ignore race condition duplicates
  }
}

export async function ensureCurrency(orgId: string, code: string): Promise<void> {
  if (!code || !orgId) return;
  await ensureCurrencies(orgId, [code]);
}
