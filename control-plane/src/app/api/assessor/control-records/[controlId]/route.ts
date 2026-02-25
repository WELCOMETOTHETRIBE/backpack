import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  roles,
  artifacts,
  technicalEvidence,
  controlRecordHistory,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/assessor/control-records/:controlId — control record + artifacts + technical evidence + history (read-only for assessor).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ controlId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Assessor"]);
    const { controlId } = await params;

    const [record] = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        technicalNarrative: controlRecords.technicalNarrative,
        responsibleRoleId: controlRecords.responsibleRoleId,
        inheritedFrom: controlRecords.inheritedFrom,
        assessorFindings: controlRecords.assessorFindings,
        assessmentDate: controlRecords.assessmentDate,
        title: controls.title,
        roleName: roles.name,
      })
      .from(controlRecords)
      .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
      .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      )
      .limit(1);

    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const artList = await db
      .select({
        id: artifacts.id,
        artifactLabel: artifacts.artifactLabel,
        fileName: artifacts.fileName,
        fileUrl: artifacts.fileUrl,
        storageKey: artifacts.storageKey,
      })
      .from(artifacts)
      .where(eq(artifacts.controlRecordId, record.id));

    const techList = await db
      .select({
        id: technicalEvidence.id,
        requirementId: technicalEvidence.requirementId,
        description: technicalEvidence.description,
        fileUrl: technicalEvidence.fileUrl,
        sourceUrl: technicalEvidence.sourceUrl,
        evidenceType: technicalEvidence.evidenceType,
      })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.controlRecordId, record.id));

    const historyList = await db
      .select({
        id: controlRecordHistory.id,
        fieldName: controlRecordHistory.fieldName,
        oldValue: controlRecordHistory.oldValue,
        newValue: controlRecordHistory.newValue,
        createdAt: controlRecordHistory.createdAt,
        changedByEmail: users.email,
      })
      .from(controlRecordHistory)
      .leftJoin(users, eq(controlRecordHistory.changedById, users.id))
      .where(eq(controlRecordHistory.controlRecordId, record.id))
      .orderBy(desc(controlRecordHistory.createdAt));

    return NextResponse.json({
      record: {
        id: record.id,
        controlId: record.controlId,
        title: record.title,
        implementationStatus: record.implementationStatus,
        governanceNarrative: record.governanceNarrative,
        technicalNarrative: record.technicalNarrative,
        responsibleRoleName: record.roleName,
        inheritedFrom: record.inheritedFrom,
        assessorFindings: record.assessorFindings,
        assessmentDate: record.assessmentDate,
      },
      artifacts: artList,
      technicalEvidence: techList,
      history: historyList,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
