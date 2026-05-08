"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";

async function requireAdminOrgId(): Promise<string> {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined;
  if (!user?.organizationId) redirect("/auth/signin");
  if (user.role !== "Admin") {
    throw new Error("Only Admins can configure integration settings");
  }
  return user.organizationId;
}

export async function saveTenantIdAction(formData: FormData) {
  const orgId = await requireAdminOrgId();
  const raw = (formData.get("trainosTenantId") ?? "").toString().trim();
  if (!raw || !/^[a-zA-Z0-9_-]+$/.test(raw) || raw.length > 64) {
    throw new Error("Invalid tenant ID — letters, digits, underscores, hyphens; max 64 chars");
  }

  // Prevent collision: if another org already claims this tenant ID, refuse.
  const [collision] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.trainosTenantId, raw))
    .limit(1);
  if (collision && collision.id !== orgId) {
    throw new Error(
      "Another organization is already mapped to this TrainOS tenant ID. Contact MacTech support if this is a mistake."
    );
  }

  await db.update(organizations).set({ trainosTenantId: raw }).where(eq(organizations.id, orgId));
  await writeAuditLog({
    organizationId: orgId,
    action: "trainos.tenant_id_saved",
    resourceType: "organization",
    resourceId: orgId,
    details: { trainos_tenant_id: raw },
  }).catch(() => {});

  redirect("/dashboard/settings/integrations/trainos?saved=1");
}

export async function rotateWebhookSecretAction() {
  const orgId = await requireAdminOrgId();
  const secret = randomBytes(32).toString("hex");
  await db.update(organizations).set({ trainosWebhookSecret: secret }).where(eq(organizations.id, orgId));
  await writeAuditLog({
    organizationId: orgId,
    action: "trainos.webhook_secret_rotated",
    resourceType: "organization",
    resourceId: orgId,
    details: { secret_last4: secret.slice(-4) },
  }).catch(() => {});

  // Show-once UX: pass the new secret in the redirect query so the page
  // can render it once. Subsequent loads only show last-4.
  redirect(`/dashboard/settings/integrations/trainos?newSecret=${encodeURIComponent(secret)}`);
}
