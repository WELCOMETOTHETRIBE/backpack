import { NextResponse } from "next/server";
import { db } from "@/db";
import { artifacts, controlRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * POST /api/artifacts/:id/upload — attach (or replace) the file on an
 * existing artifact row. Works for both "awaiting_upload" placeholders and
 * already-uploaded artifacts (replace flow).
 *
 * Body: multipart/form-data with `file`. Optional: `version`, `approvalDate`.
 *
 * On success the row's file_* columns are set and status flips to "uploaded".
 * The linked control's status is recomputed.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.organizationId, orgId)))
      .limit(1);
    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [record] = await db
      .select({ controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.id, artifact.controlRecordId))
      .limit(1);
    if (!record) {
      return NextResponse.json({ error: "Control record missing" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const version = (formData.get("version") as string) || null;
    const approvalDateRaw = formData.get("approvalDate") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
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

    const approvalDate = approvalDateRaw
      ? approvalDateRaw.match(/^\d{4}-\d{2}-\d{2}$/)
        ? approvalDateRaw
        : null
      : null;

    // Best-effort: if this artifact had a prior file, delete the old blob.
    if (artifact.storageKey && artifact.storageKey !== fileId) {
      try {
        await storage.delete(artifact.storageKey);
      } catch {
        // non-fatal
      }
    }

    const [updated] = await db
      .update(artifacts)
      .set({
        fileName,
        fileUrl,
        storageKey: fileId,
        fileType: mimeType,
        fileSize: buffer.length,
        version: version ?? artifact.version,
        approvalDate: approvalDate ?? artifact.approvalDate,
        uploadedBy: user.id,
        status: "uploaded",
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, id))
      .returning();

    await calculateControlStatus(artifact.controlRecordId);

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
