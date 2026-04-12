"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizations, organizationMembers } from "@/db/schema/system";

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

  let orgId: string;

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

    orgId = org.id;

    await db.insert(organizationMembers).values({
      organizationId: orgId,
      userId,
      role: "org_admin",
      acceptedAt: new Date(),
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Database error.";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { error: "That slug is already taken. Choose another." };
    }
    return { error: msg };
  }

  redirect("/app/dashboard");
}
