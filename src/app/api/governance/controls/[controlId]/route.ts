import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  controlFamilies,
  governanceControlMetadata,
  governanceControlLinks,
  roles,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";

/**
 * GET /api/governance/controls/[controlId]
 * Detail: control record + metadata + NIST text + artifact checklist + audit trail.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ controlId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { controlId } = await params;
    if (!controlId) return NextResponse.json({ error: "controlId required" }, { status: 400 });

    const [record] = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        responsibleRoleId: controlRecords.responsibleRoleId,
        roleName: roles.name,
      })
      .from(controlRecords)
      .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      );

    if (!record) return NextResponse.json({ error: "Control record not found" }, { status: 404 });

    const [meta] = await db
      .select()
      .from(governanceControlMetadata)
      .where(eq(governanceControlMetadata.controlId, controlId));

    const [ctrl] = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        nistDiscussionGuidance: controls.nistDiscussionGuidance,
        familyCode: controlFamilies.code,
      })
      .from(controls)
      .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
      .where(eq(controls.controlId, controlId));

    const links = await db
      .select()
      .from(governanceControlLinks)
      .where(eq(governanceControlLinks.controlRecordId, record.id));

    const auditTrail = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        userEmail: users.email,
        userName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        and(
          eq(auditLogs.organizationId, orgId),
          eq(auditLogs.resourceType, "governance_control"),
          eq(auditLogs.resourceId, record.id)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    return NextResponse.json({
      record: {
        id: record.id,
        controlId: record.controlId,
        cmmcRef: ctrl?.familyCode ? `${ctrl.familyCode}.L2-${record.controlId}` : record.controlId,
        title: ctrl?.title ?? record.controlId,
        implementationStatus: record.implementationStatus,
        governanceNarrative: record.governanceNarrative,
        roleName: record.roleName,
      },
      metadata: meta
        ? {
            classification: meta.classification,
            controlStatement: meta.controlStatement,
            requiredDocuments: meta.requiredDocuments ?? [],
            requiredRegisters: meta.requiredRegisters ?? [],
            requiredHybridEvidenceTypes: meta.requiredHybridEvidenceTypes ?? [],
          }
        : null,
      nist: ctrl
        ? {
            nistExactText: ctrl.nistExactText,
            nistDiscussionGuidance: ctrl.nistDiscussionGuidance,
          }
        : null,
      links,
      auditTrail,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to get control";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/**
 * PATCH /api/governance/controls/[controlId]
 * Update implementationStatus, governanceNarrative.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ controlId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { controlId } = await params;
    if (!controlId) return NextResponse.json({ error: "controlId required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const implementationStatus = body.implementationStatus as string | undefined;
    const governanceNarrative = body.governanceNarrative as string | null | undefined;

    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      );

    if (!record) return NextResponse.json({ error: "Control record not found" }, { status: 404 });

    const validStatuses = ["not_started", "in_progress", "implemented", "assessed", "inherited", "not_applicable"] as const;
    const updates: {
      implementationStatus?: (typeof validStatuses)[number];
      governanceNarrative?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (implementationStatus !== undefined && validStatuses.includes(implementationStatus as (typeof validStatuses)[number]))
      updates.implementationStatus = implementationStatus as (typeof validStatuses)[number];
    if (governanceNarrative !== undefined)
      updates.governanceNarrative = governanceNarrative ?? null;

    await db
      .update(controlRecords)
      .set({
        ...updates,
        implementationStatus: updates.implementationStatus,
        governanceNarrative: updates.governanceNarrative,
        updatedAt: updates.updatedAt,
      } as { implementationStatus?: (typeof validStatuses)[number]; governanceNarrative?: string | null; updatedAt: Date })
      .where(eq(controlRecords.id, record.id));

    await logGovernanceAudit(
      orgId,
      user.id ?? null,
      "governance_control_updated",
      "governance_control",
      record.id,
      { controlId, updates }
    );

    // Canonical rescore on operator-driven implementation_status change.
    // See note on src/app/api/control-records/[id]/route.ts — without
    // this, the SCTM family aggregate stays stale even after the
    // operator marks a control implemented.
    if ("implementationStatus" in updates) {
      try {
        const { scoreControlsAffectedBy } = await import(
          "@/lib/canonical-state/rescore-trigger"
        );
        await scoreControlsAffectedBy({
          organizationId: orgId,
          triggerSource: "manual_override",
          controlIds: [controlId],
          triggeredByUserId: user.id ?? null,
        });
      } catch (rescoreErr) {
        console.error(
          "[governance/controls PATCH] canonical rescore failed (non-blocking):",
          rescoreErr,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update control";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
