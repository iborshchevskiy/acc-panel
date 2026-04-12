"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizations, organizationMembers } from "@/db/schema/system";
import { currencies, orgTransactionTypes } from "@/db/schema/wallets";
import { sendWelcomeEmail } from "@/lib/email";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

interface ActionResult {
  error: string;
}

export async function createOrg(
  formData: FormData
): Promise<ActionResult | undefined> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slug = (formData.get("slug") as string | null)?.trim() ?? "";
  const baseCurrency =
    (formData.get("baseCurrency") as string | null)?.trim().toUpperCase() ?? "USD";

  if (!name) {
    return { error: "Organisation name is required." };
  }

  if (!slug || !SLUG_RE.test(slug)) {
    return {
      error:
        "Invalid slug. Use lowercase letters, numbers, and hyphens only (must start and end with alphanumeric).",
    };
  }

  if (!baseCurrency) {
    return { error: "Base currency is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const userId = user.id;

  try {
    const [org] = await db
      .insert(organizations)
      .values({
        name,
        slug,
        baseCurrency,
        createdBy: userId,
      })
      .returning({ id: organizations.id });

    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId,
      email: user.email ?? null,
      role: "org_admin",
      acceptedAt: new Date(),
    });

    // Seed default currencies
    const defaultCurrencies = [
      { code: "USDT", name: "Tether USD", type: "crypto" as const },
      { code: "TRX", name: "TRON", type: "crypto" as const },
      { code: "ETH", name: "Ethereum", type: "crypto" as const },
      { code: "BNB", name: "BNB", type: "crypto" as const },
      { code: "SOL", name: "Solana", type: "crypto" as const },
      { code: "USDC", name: "USD Coin", type: "crypto" as const },
      { code: "BTC", name: "Bitcoin", type: "crypto" as const },
      { code: "EUR", name: "Euro", type: "fiat" as const },
      { code: "USD", name: "US Dollar", type: "fiat" as const },
    ];
    for (const c of defaultCurrencies) {
      await db.insert(currencies).values({ organizationId: org.id, ...c }).onConflictDoNothing();
    }

    // Seed default transaction types
    const defaultTypes = ["Exchange", "Revenue", "Expense", "Debt", "Transfer", "Fee"];
    for (const name of defaultTypes) {
      await db.insert(orgTransactionTypes).values({ organizationId: org.id, name }).onConflictDoNothing();
    }
    // Send welcome email (non-blocking)
    sendWelcomeEmail({ email: user.email ?? "", orgName: name }).catch(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Database error.";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { error: "That slug is already taken. Choose another." };
    }
    return { error: msg };
  }

  redirect("/app/dashboard");
}
