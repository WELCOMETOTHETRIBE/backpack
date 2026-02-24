import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceEvidenceItems, governanceEvidenceFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { sha256Hex } from "@/lib/governance/hash";

/** POST /api/governance/evidence/[id]/files — upload file (multipart: file) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [item] = await db
      .select()
      .from(governanceEvidenceItems)
      .where(
        and(
          eq(governanceEvidenceItems.organizationId, orgId),
          eq(governanceEvidenceItems.id, id)
        )
      );

    if (!item) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: "file required" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = sha256Hex(buffer);

    const storage = getStorageService();
    const result = await storage.upload(buffer, {
      organizationId: orgId,
      controlId: `gov-evidence-${id}`,
      fileName: file.name || "evidence",
      mimeType: file.type || "application/octet-stream",
    });

    const [row] = await db
      .insert(governanceEvidenceFiles)
      .values({
        evidenceItemId: id,
        fileUrl: result.fileUrl,
        storageKey: result.fileId,
        sha256Hash: hash,
        fileSize: buffer.length,
        mimeType: file.type || null,
        originalFilename: file.name || null,
      })
      .returning();

    await db
      .update(governanceEvidenceItems)
      .set({ sha256Hash: hash, updatedAt: new Date() })
      .where(eq(governanceEvidenceItems.id, id));

    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
