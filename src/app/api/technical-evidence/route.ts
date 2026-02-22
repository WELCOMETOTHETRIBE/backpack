import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, technicalEvidence } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { calculateControlStatus } from "@/lib/control-status";

/** Map requirement EvidenceType to DB evidence_type enum. */
const EVIDENCE_TYPE_MAP: Record<string, "screenshot" | "config_file" | "scan_result" | "log_file"> = {
  screenshot: "screenshot",
  log_excerpt: "log_file",
  config_export: "config_file",
  api_export: "config_file",
  policy_config: "config_file",
  tool_report: "scan_result",
};

/**
 * GET /api/technical-evidence?controlRecordId=...
 * List technical evidence for a control record.
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const controlRecordId = searchParams.get("controlRecordId");
    if (!controlRecordId) {
      return NextResponse.json({ error: "controlRecordId required" }, { status: 400 });
    }
    const rows = await db
      .select()
      .from(technicalEvidence)
      .where(
        and(
          eq(technicalEvidence.controlRecordId, controlRecordId),
          eq(technicalEvidence.organizationId, orgId)
        )
      );
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/technical-evidence
 * Create technical evidence. Either multipart (file + controlRecordId + requirementId + evidenceType) or JSON (controlRecordId, requirementId, evidenceType, sourceUrl, description).
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);

    const contentType = req.headers.get("content-type") ?? "";
    let controlRecordId: string;
    let requirementId: string | null = null;
    let evidenceType: "screenshot" | "config_file" | "scan_result" | "log_file" = "screenshot";
    let description: string | null = null;
    let fileUrl: string | null = null;
    let sourceUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      controlRecordId = (formData.get("controlRecordId") as string) ?? "";
      requirementId = (formData.get("requirementId") as string) || null;
      const rawType = (formData.get("evidenceType") as string) || "screenshot";
      evidenceType = EVIDENCE_TYPE_MAP[rawType] ?? "screenshot";
      description = (formData.get("description") as string) || null;

      if (!file || !controlRecordId) {
        return NextResponse.json(
          { error: "file and controlRecordId are required" },
          { status: 400 }
        );
      }

      const [record] = await db
        .select()
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.id, controlRecordId),
            eq(controlRecords.organizationId, orgId)
          )
        )
        .limit(1);
      if (!record) {
        return NextResponse.json({ error: "Control record not found" }, { status: 404 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name || "evidence";
      const mimeType = file.type || "application/octet-stream";
      const storage = getStorageService();
      const uploaded = await storage.upload(buffer, {
        organizationId: orgId,
        controlId: record.controlId,
        fileName,
        mimeType,
      });
      fileUrl = uploaded.fileUrl;
    } else {
      const body = await req.json();
      controlRecordId = body.controlRecordId;
      requirementId = body.requirementId ?? null;
      const rawType = body.evidenceType || "screenshot";
      evidenceType = EVIDENCE_TYPE_MAP[rawType] ?? "screenshot";
      description = body.description ?? null;
      sourceUrl = body.sourceUrl ?? null;

      if (!controlRecordId) {
        return NextResponse.json(
          { error: "controlRecordId is required" },
          { status: 400 }
        );
      }
      if (!sourceUrl && !description) {
        return NextResponse.json(
          { error: "sourceUrl or description is required for JSON body" },
          { status: 400 }
        );
      }

      const [record] = await db
        .select()
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.id, controlRecordId),
            eq(controlRecords.organizationId, orgId)
          )
        )
        .limit(1);
      if (!record) {
        return NextResponse.json({ error: "Control record not found" }, { status: 404 });
      }
    }

    const [inserted] = await db
      .insert(technicalEvidence)
      .values({
        organizationId: orgId,
        controlRecordId,
        requirementId: requirementId ?? undefined,
        evidenceType,
        description: description ?? undefined,
        fileUrl: fileUrl ?? undefined,
        sourceUrl: sourceUrl ?? undefined,
        uploadedBy: user.id,
      })
      .returning();

    await calculateControlStatus(controlRecordId);
    return NextResponse.json(inserted);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create technical evidence";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
