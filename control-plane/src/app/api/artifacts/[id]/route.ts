import { NextResponse } from "next/server";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * GET /api/artifacts/:id/download — redirect to signed download URL (one-click download for assessor/dashboard).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.organizationId, orgId)))
      .limit(1);

    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const key = artifact.storageKey ?? artifact.fileUrl;
    if (!key) return NextResponse.json({ error: "No file" }, { status: 404 });
    const storage = getStorageService();
    const url = await storage.getDownloadUrl(key);
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/artifacts/:id — delete an artifact and recalculate control status.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.organizationId, orgId)))
      .limit(1);

    if (!artifact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storageKey = artifact.storageKey ?? artifact.fileUrl;
    if (storageKey) {
      try {
        const storage = getStorageService();
        await storage.delete(storageKey);
      } catch {
        // Storage delete best-effort; still remove DB record
      }
    }

    const controlRecordId = artifact.controlRecordId;
    await db.delete(artifacts).where(eq(artifacts.id, id));
    await calculateControlStatus(controlRecordId);

    return NextResponse.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
