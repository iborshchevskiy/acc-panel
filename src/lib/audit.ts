import { db } from "@/db/client";
import { auditLogs } from "@/db/schema/system";

export async function logAudit(params: {
  organizationId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      organizationId: params.organizationId,
      userId: params.userId,
      userEmail: params.userEmail,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    });
  } catch {
    // Audit log failure must never break the main action
  }
}
