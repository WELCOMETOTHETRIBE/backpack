import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceDocuments, governanceDocumentVersions, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";

/**
 * GET /api/governance/documents/[docId] — detail + version history.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
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

    const versions = await db
      .select({
        id: governanceDocumentVersions.id,
        versionNumber: governanceDocumentVersions.versionNumber,
        fileUrl: governanceDocumentVersions.fileUrl,
        sha256Hash: governanceDocumentVersions.sha256Hash,
        fileSize: governanceDocumentVersions.fileSize,
        mimeType: governanceDocumentVersions.mimeType,
        originalFilename: governanceDocumentVersions.originalFilename,
        createdAt: governanceDocumentVersions.createdAt,
        createdById: governanceDocumentVersions.createdById,
        creatorEmail: users.email,
      })
      .from(governanceDocumentVersions)
      .leftJoin(users, eq(governanceDocumentVersions.createdById, users.id))
      .where(eq(governanceDocumentVersions.documentId, doc.id))
      .orderBy(desc(governanceDocumentVersions.versionNumber));

    return NextResponse.json({ document: doc, versions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to get document";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/**
 * PATCH /api/governance/documents/[docId] — update metadata (title, domain, etc.).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { docId } = await params;
    if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

    const [doc] = await db
      .select({ id: governanceDocuments.id })
      .from(governanceDocuments)
      .where(
        and(
          eq(governanceDocuments.organizationId, orgId),
          eq(governanceDocuments.id, docId)
        )
      );

    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.domain !== undefined) updates.domain = body.domain;
    if (body.ownerId !== undefined) updates.ownerId = body.ownerId;
    if (body.reviewCadenceDays !== undefined) updates.reviewCadenceDays = body.reviewCadenceDays;

    await db
      .update(governanceDocuments)
      .set(updates as Record<string, unknown>)
      .where(eq(governanceDocuments.id, doc.id));

    await logGovernanceAudit(orgId, user.id ?? null, "governance_document_updated", "governance_document", doc.id, { updates });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update document";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
