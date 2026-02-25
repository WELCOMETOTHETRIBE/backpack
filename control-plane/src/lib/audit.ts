import { db } from "@/db";
import { auditLogs } from "@/db/schema";

type AuditParams = {
  organizationId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
};

export async function writeAuditLog(params: AuditParams) {
  await db.insert(auditLogs).values({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    details: params.details ?? null,
    ip: params.ip ?? null,
  });
}
