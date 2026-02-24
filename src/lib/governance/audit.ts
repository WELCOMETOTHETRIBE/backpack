import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function logGovernanceAudit(
  organizationId: string,
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details?: Record<string, unknown>
) {
  await db.insert(auditLogs).values({
    organizationId,
    userId,
    action,
    resourceType,
    resourceId,
    details: details ?? null,
  });
}
