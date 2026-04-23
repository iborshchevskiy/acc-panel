/**
 * Cached auth helpers for server components.
 *
 * React.cache() deduplicates calls within the same RSC render pass —
 * so multiple server components calling getAuthUser() in the same request
 * only hit Supabase's auth server once instead of N times.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import { db } from "@/db/client";
import { organizationMembers } from "@/db/schema/system";
import { eq } from "drizzle-orm";

/** Cached: returns the verified user or null. One network call per request max. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/** Cached: returns { user, orgId } or redirects. One auth call + one DB query per request. */
export const getAuthContext = cache(async () => {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);

  if (!membership) redirect("/app/onboarding");

  return { user, orgId: membership.organizationId };
});
