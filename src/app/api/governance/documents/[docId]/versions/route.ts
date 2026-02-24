import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceDocuments, governanceDocumentVersions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { sha256Hex } from "@/lib/governance/hash";
import { logGovernanceAudit } from "@/lib/governance/audit";

/**
 * POST /api/governance/documents/[docId]/versions — upload new version (multipart: file).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { docId } = await params;
    if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

    const [doc] = await db
      .select()
      .from(governanceDocuments)
      .where(
        and(
          eq(governanceDocuments.organizationId, orgId),
          eq(governanceDocuments.id, docId)
        )
      );

    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = sha256Hex(buffer);
    const mimeType = file.type || "application/octet-stream";
    const originalFilename = file.name || "document.pdf";

    const storage = getStorageService();
    const result = await storage.upload(buffer, {
      organizationId: orgId,
      controlId: `gov-doc-${doc.id}`,
      fileName: originalFilename,
      mimeType,
    });

    const [lastVersion] = await db
      .select({ versionNumber: governanceDocumentVersions.versionNumber })
      .from(governanceDocumentVersions)
      .where(eq(governanceDocumentVersions.documentId, doc.id))
      .orderBy(desc(governanceDocumentVersions.versionNumber))
      .limit(1);

    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const [version] = await db
      .insert(governanceDocumentVersions)
      .values({
        documentId: doc.id,
        versionNumber,
        fileUrl: result.fileUrl,
        storageKey: result.fileId,
        sha256Hash: hash,
        fileSize: buffer.length,
        mimeType,
        originalFilename,
        createdById: user.id ?? null,
      })
      .returning();

    await db
      .update(governanceDocuments)
      .set({
        version: String(versionNumber),
        updatedAt: new Date(),
        status: doc.status === "APPROVED" ? "DRAFT" : doc.status,
      })
      .where(eq(governanceDocuments.id, doc.id));

    await logGovernanceAudit(orgId, user.id ?? null, "governance_document_version_uploaded", "governance_document_version", version?.id ?? null, { documentId: doc.id, versionNumber });

    return NextResponse.json(version);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
