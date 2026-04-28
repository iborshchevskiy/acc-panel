"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizations, organizationMembers } from "@/db/schema/system";
import { currencies, orgTransactionTypes } from "@/db/schema/wallets";
import { sendWelcomeEmail } from "@/lib/email";

/* ── Slug helpers ─────────────────────────────────────────────────────── */

/** Greedily strip everything that isn't a-z0-9 or hyphen, lowercased.
 *  If the org name was Cyrillic / Arabic / emoji, this can produce "" — that's
 *  fine, the caller falls back to a random slug. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomSuffix(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

/** Build a slug we can be 100% sure passes the DB unique constraint. The DB
 *  has a `unique` index on slug, so we keep retrying with a random suffix
 *  until insert succeeds, up to 5 attempts. */
async function insertOrgWithUniqueSlug(values: {
  name: string;
  baseSlug: string;
  baseCurrency: string;
  createdBy: string;
}): Promise<{ id: string; slug: string }> {
  const candidates: string[] = [];
  const base = values.baseSlug || `org-${randomSuffix(6)}`;
  candidates.push(base);
  for (let i = 0; i < 4; i++) candidates.push(`${base}-${randomSuffix(4)}`);

  let lastErr: unknown;
  for (const slug of candidates) {
    try {
      const [row] = await db
        .insert(organizations)
        .values({
          name: values.name,
          slug,
          baseCurrency: values.baseCurrency,
          createdBy: values.createdBy,
        })
        .returning({ id: organizations.id });
      return { id: row.id, slug };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        lastErr = err;
        continue; // try next candidate
      }
      throw err; // not a uniqueness failure — surface it
    }
  }
  throw lastErr ?? new Error("Could not create organisation — slug clash");
}

/* ── Action ───────────────────────────────────────────────────────────── */

export async function createOrg(formData: FormData): Promise<void> {
  const name = ((formData.get("name") as string) ?? "").trim();
  // Custom typed code wins over the radio selection so users can pick exotic
  // currencies without us pre-listing them. Clamp length so a typo can't
  // break downstream display.
  const customCode = ((formData.get("baseCurrencyCustom") as string) ?? "").trim().toUpperCase();
  const radioCode  = ((formData.get("baseCurrency") as string) ?? "USD").trim().toUpperCase();
  const baseCurrency = (customCode || radioCode).replace(/[^A-Z0-9]/g, "").slice(0, 8) || "USD";

  if (!name) {
    redirect("/onboarding?error=" + encodeURIComponent("Organisation name is required."));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please sign in again."));
  }

  let orgId: string;
  try {
    const inserted = await insertOrgWithUniqueSlug({
      name,
      baseSlug: slugify(name),
      baseCurrency,
      createdBy: user.id,
    });
    orgId = inserted.id;

    await db.insert(organizationMembers).values({
      organizationId: orgId,
      userId: user.id,
      email: user.email ?? null,
      role: "org_admin",
      acceptedAt: new Date(),
    });

    // Seed default currencies (idempotent — onConflictDoNothing)
    const defaultCurrencies = [
      { code: "USDT", name: "Tether USD", type: "crypto" as const },
      { code: "TRX",  name: "TRON",       type: "crypto" as const },
      { code: "ETH",  name: "Ethereum",   type: "crypto" as const },
      { code: "BNB",  name: "BNB",        type: "crypto" as const },
      { code: "SOL",  name: "Solana",     type: "crypto" as const },
      { code: "USDC", name: "USD Coin",   type: "crypto" as const },
      { code: "BTC",  name: "Bitcoin",    type: "crypto" as const },
      { code: "EUR",  name: "Euro",       type: "fiat"   as const },
      { code: "USD",  name: "US Dollar",  type: "fiat"   as const },
    ];
    // Always include the user's chosen base currency, even if it's exotic
    if (!defaultCurrencies.some(c => c.code === baseCurrency)) {
      defaultCurrencies.push({ code: baseCurrency, name: baseCurrency, type: "fiat" as const });
    }
    for (const c of defaultCurrencies) {
      await db.insert(currencies).values({ organizationId: orgId, ...c }).onConflictDoNothing();
    }

    // Seed default transaction types
    const defaultTypes = ["Exchange", "Revenue", "Expense", "Debt", "Transfer", "Fee"];
    for (const tn of defaultTypes) {
      await db.insert(orgTransactionTypes).values({ organizationId: orgId, name: tn }).onConflictDoNothing();
    }

    // Welcome email is fire-and-forget; never block onboarding on it.
    sendWelcomeEmail({ email: user.email ?? "", orgName: name }).catch(() => {});
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Could not create organisation.";
    redirect("/onboarding?error=" + encodeURIComponent(msg));
  }

  redirect("/app/dashboard");
}
