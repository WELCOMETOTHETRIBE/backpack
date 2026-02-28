import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  artifacts,
  governanceArtifactCompletions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getRequiredArtifactSpecs } from "@/lib/artifact-guide";
import { controlIdToNist } from "@/lib/compliance/controlId";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * GET /api/control-records/artifacts?control_id=3.5.3
 * Returns required artifacts (with type) and current completion state (uploads + non-upload completions).
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const controlIdParam = searchParams.get("control_id")?.trim();
    if (!controlIdParam) {
      return NextResponse.json({ error: "control_id required" }, { status: 400 });
    }
    const controlId = controlIdToNist(controlIdParam);

    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Control record not found" }, { status: 404 });
    }

    const required = getRequiredArtifactSpecs(controlId);
    const uploadRows = await db
      .select({ artifactLabel: artifacts.artifactLabel })
      .from(artifacts)
      .where(eq(artifacts.controlRecordId, record.id));
    const uploadLabels = new Set(uploadRows.map((r) => r.artifactLabel));

    const completionRows = await db
      .select()
      .from(governanceArtifactCompletions)
      .where(eq(governanceArtifactCompletions.controlRecordId, record.id));

    const completions = completionRows.map((c) => ({
      artifact_label: c.artifactLabel,
      artifact_type: c.artifactType,
      value_text: c.valueText ?? undefined,
      attested_by: c.attestedBy ?? undefined,
      attested_at: c.attestedAt ? (c.attestedAt instanceof Date ? c.attestedAt.toISOString() : String(c.attestedAt)) : undefined,
    }));

    return NextResponse.json({
      control_id: controlId,
      control_record_id: record.id,
      required,
      upload_labels: Array.from(uploadLabels),
      completions,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load artifacts";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/control-records/artifacts
 * Upsert a non-upload artifact completion (REFERENCE, ATTESTATION, SYSTEM_POINTER).
 * Body: { control_id, artifact_label, artifact_type, value_text?, attested_by? }
 * attested_at is set to now when attestation is provided.
 */
export async function PUT(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = (await req.json()) as {
      control_id?: string;
      artifact_label?: string;
      artifact_type?: string;
      value_text?: string;
      attested_by?: string;
    };

    const controlIdParam = body.control_id?.trim();
    const artifactLabel = body.artifact_label?.trim();
    const artifactType = body.artifact_type?.trim();

    if (!controlIdParam || !artifactLabel || !artifactType) {
      return NextResponse.json(
        { error: "control_id, artifact_label, and artifact_type are required" },
        { status: 400 }
      );
    }

    const validTypes = ["REFERENCE", "ATTESTATION", "SYSTEM_POINTER"];
    if (!validTypes.includes(artifactType)) {
      return NextResponse.json(
        { error: `artifact_type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const controlId = controlIdToNist(controlIdParam);

    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Control record not found" }, { status: 404 });
    }

    const valueText = body.value_text != null ? String(body.value_text).trim() || null : null;
    const attestedBy = artifactType === "ATTESTATION" ? (body.attested_by ?? user.id) : null;
    const attestedAt = artifactType === "ATTESTATION" ? new Date() : null;

    await db
      .insert(governanceArtifactCompletions)
      .values({
        organizationId: orgId,
        controlRecordId: record.id,
        artifactLabel,
        artifactType,
        valueText,
        attestedBy,
        attestedAt,
      })
      .onConflictDoUpdate({
        target: [governanceArtifactCompletions.controlRecordId, governanceArtifactCompletions.artifactLabel],
        set: {
          valueText: valueText ?? null,
          attestedBy: attestedBy ?? null,
          attestedAt: attestedAt ?? null,
          updatedAt: new Date(),
        },
      });

    await calculateControlStatus(record.id);

    return NextResponse.json({ ok: true, control_record_id: record.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save artifact completion";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
