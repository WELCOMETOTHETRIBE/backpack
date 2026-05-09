/**
 * POST /api/control-state/overrides
 *
 * Operator-pinned override on a control's bin-1-5 status. Production-
 * grade replacement for the silent writes to
 * control_records.implementation_status that produced the May-2026
 * false positives. Every override is recorded with reason + user +
 * optional expiry, and renders visibly distinct in the UI so a C3PAO
 * never mistakes one for a derived verdict.
 *
 * Body (Zod-strict):
 *   {
 *     controlId: string (NIST short, e.g., "3.1.1"),
 *     overrideStatus: "implemented" | "inherited" | "not_applicable" | "outstanding",
 *     reason: string (≥8 chars; this is what the auditor reads),
 *     expiresAt?: string (ISO datetime — null/absent = no auto-expiry)
 *   }
 *
 * One active override per (org, control). Re-pinning the same control
 * revokes the prior row (audit-preserving) and inserts a new one.
 *
 * Auth: Admin only. (Override is a status determination; only Admin
 * can speak with that authority.)
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { controlStatusOverrides } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

const OverrideSchema = z
  .object({
    controlId: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "controlId must be NIST-short form (e.g. 3.1.1)"),
    overrideStatus: z.enum([
      "implemented",
      "inherited",
      "not_applicable",
      "outstanding",
    ]),
    reason: z.string().min(8).max(2000),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  let orgId: string;
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
  if (!user.id) {
    return NextResponse.json({ error: "Authenticated user has no id" }, { status: 401 });
  }
  const userId: string = user.id;

  const raw = await req.json().catch(() => null);
  const parsed = OverrideSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Revoke any existing active override for this (org, control).
  await db
    .update(controlStatusOverrides)
    .set({
      revokedAt: new Date(),
      revokedByUserId: userId,
      revokedReason: "superseded by new override",
    })
    .where(
      and(
        eq(controlStatusOverrides.organizationId, orgId),
        eq(controlStatusOverrides.controlId, parsed.data.controlId),
        isNull(controlStatusOverrides.revokedAt),
      ),
    );

  const [override] = await db
    .insert(controlStatusOverrides)
    .values({
      organizationId: orgId,
      controlId: parsed.data.controlId,
      overrideStatus: parsed.data.overrideStatus,
      reason: parsed.data.reason,
      setByUserId: userId,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning();

  await writeAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "control_status.override_set",
    resourceType: "control_status_override",
    resourceId: override.id,
    details: {
      controlId: override.controlId,
      overrideStatus: override.overrideStatus,
      reason: override.reason,
      expiresAt: override.expiresAt,
    },
  });

  // Phase B trigger: the override changes binStatus immediately on
  // every read surface, but the canonical aggregate_finding only
  // refreshes when the snapshot is rescored. Trigger here so the
  // SCTM and dashboard reflect the override on the very next render.
  await scoreControlsAffectedBy({
    organizationId: orgId,
    triggerSource: "manual_override",
    controlIds: [parsed.data.controlId],
    triggeredByUserId: user.id,
  });

  return NextResponse.json(
    { ok: true, override },
    { status: 201 },
  );
}

/**
 * DELETE /api/control-state/overrides?controlId=3.1.1
 *
 * Revoke the active override on a control. The override row is
 * preserved for audit (revoked_at + revoked_by_user_id stamped); a
 * subsequent read returns the canonical-derived state again.
 */
export async function DELETE(req: NextRequest) {
  let orgId: string;
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
  if (!user.id) {
    return NextResponse.json({ error: "Authenticated user has no id" }, { status: 401 });
  }
  const userId: string = user.id;

  const url = new URL(req.url);
  const controlId = url.searchParams.get("controlId");
  if (!controlId || !/^\d+\.\d+\.\d+$/.test(controlId)) {
    return NextResponse.json(
      { error: "controlId query param required (NIST-short form)" },
      { status: 400 },
    );
  }
  const reason = url.searchParams.get("reason") ?? "operator revocation";

  const result = await db
    .update(controlStatusOverrides)
    .set({
      revokedAt: new Date(),
      revokedByUserId: userId,
      revokedReason: reason,
    })
    .where(
      and(
        eq(controlStatusOverrides.organizationId, orgId),
        eq(controlStatusOverrides.controlId, controlId),
        isNull(controlStatusOverrides.revokedAt),
      ),
    )
    .returning();

  if (result.length === 0) {
    return NextResponse.json(
      { error: "No active override for this control" },
      { status: 404 },
    );
  }

  await writeAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "control_status.override_revoked",
    resourceType: "control_status_override",
    resourceId: result[0].id,
    details: { controlId, reason },
  });

  await scoreControlsAffectedBy({
    organizationId: orgId,
    triggerSource: "manual_override",
    controlIds: [controlId],
    triggeredByUserId: user.id,
  });

  return NextResponse.json({ ok: true, revoked: result[0] });
}
