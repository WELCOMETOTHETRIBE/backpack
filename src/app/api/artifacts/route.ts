import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, artifacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * GET /api/artifacts?controlRecordId=... — list artifacts for a control record.
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
      .from(artifacts)
      .where(
        and(
          eq(artifacts.controlRecordId, controlRecordId),
          eq(artifacts.organizationId, orgId)
        )
      );
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/artifacts — upload a file for a control record.
 * Body: multipart/form-data with file, controlRecordId, artifactLabel, version (optional), approvalDate (optional).
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const controlRecordId = formData.get("controlRecordId") as string | null;
    const artifactLabel = formData.get("artifactLabel") as string | null;
    const version = (formData.get("version") as string) || null;
    const approvalDateRaw = formData.get("approvalDate") as string | null;

    if (!file || !controlRecordId || !artifactLabel) {
      return NextResponse.json(
        { error: "file, controlRecordId, and artifactLabel are required" },
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
    const fileName = file.name || "document";
    const mimeType = file.type || "application/octet-stream";

    const storage = getStorageService();
    const { fileUrl, fileId } = await storage.upload(buffer, {
      organizationId: orgId,
      controlId: record.controlId,
      fileName,
      mimeType,
    });

    const approvalDate = approvalDateRaw ? (approvalDateRaw.match(/^\d{4}-\d{2}-\d{2}$/) ? approvalDateRaw : null) : null;

    const [inserted] = await db
      .insert(artifacts)
      .values({
        organizationId: orgId,
        controlRecordId,
        artifactLabel,
        fileName,
        fileUrl,
        storageKey: fileId,
        fileType: mimeType,
        fileSize: buffer.length,
        version: version || null,
        approvalDate: approvalDate ?? null,
        uploadedBy: user.id,
      })
      .returning();

    await calculateControlStatus(controlRecordId);

    return NextResponse.json(inserted);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
