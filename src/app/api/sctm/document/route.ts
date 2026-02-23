import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  roles,
  artifacts,
  technicalEvidence,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

function csvEscape(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (t.includes(",") || t.includes('"') || t.includes("\n")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/**
 * GET /api/sctm/document — Security Control Traceability Matrix as CSV.
 * Columns: Control ID, Control Name, Implementation Status, Responsible Role,
 * Governance Artifacts (comma-separated labels), Technical Evidence (comma-separated IDs/descriptions).
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const records = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        title: controls.title,
        roleName: roles.name,
      })
      .from(controlRecords)
      .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
      .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
      .where(eq(controlRecords.organizationId, orgId));

    const recordByControlId: Record<string, (typeof records)[0]> = {};
    for (const r of records) recordByControlId[r.controlId] = r;

    const allArtifacts = await db
      .select({
        controlRecordId: artifacts.controlRecordId,
        artifactLabel: artifacts.artifactLabel,
      })
      .from(artifacts)
      .where(eq(artifacts.organizationId, orgId));

    const allTechEvidence = await db
      .select({
        controlRecordId: technicalEvidence.controlRecordId,
        requirementId: technicalEvidence.requirementId,
        description: technicalEvidence.description,
      })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.organizationId, orgId));

    const artifactsByRecord = new Map<string, { artifactLabel: string }[]>();
    for (const a of allArtifacts) {
      const list = artifactsByRecord.get(a.controlRecordId) ?? [];
      list.push({ artifactLabel: a.artifactLabel });
      artifactsByRecord.set(a.controlRecordId, list);
    }
    const techByRecord = new Map<string, { requirementId: string | null; description: string | null }[]>();
    for (const t of allTechEvidence) {
      const list = techByRecord.get(t.controlRecordId) ?? [];
      list.push({
        requirementId: t.requirementId,
        description: t.description,
      });
      techByRecord.set(t.controlRecordId, list);
    }

    const rows = ALL_CONTROL_IDS.map((controlId) => {
      const r = recordByControlId[controlId];
      const recId = r?.id;
      const artList = recId ? artifactsByRecord.get(recId) ?? [] : [];
      const techList = recId ? techByRecord.get(recId) ?? [] : [];
      const governanceArtifacts = artList.map((a) => a.artifactLabel).join(", ");
      const technicalEvidenceList = techList
        .map((t) => t.requirementId || t.description || "—")
        .join("; ");
      return {
        "Control ID": controlId,
        "Control Name": r?.title ?? controlId,
        "Implementation Status": r?.implementationStatus ?? "not_started",
        "Responsible Role": r?.roleName ?? "",
        "Governance Artifacts": governanceArtifacts,
        "Technical Evidence": technicalEvidenceList,
      };
    });

    const header = ["Control ID", "Control Name", "Implementation Status", "Responsible Role", "Governance Artifacts", "Technical Evidence"];
    const csvLines = [
      header.join(","),
      ...rows.map((r) =>
        header.map((h) => csvEscape(r[h as keyof typeof r])).join(",")
      ),
    ];
    const csv = csvLines.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="Security_Control_Traceability_Matrix.csv"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
