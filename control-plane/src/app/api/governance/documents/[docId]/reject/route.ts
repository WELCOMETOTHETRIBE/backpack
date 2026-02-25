import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceDocuments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";

/** POST /api/governance/documents/[docId]/reject — SUBMITTED → REJECTED */
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
    if (doc.status !== "SUBMITTED") return NextResponse.json({ error: "Document must be SUBMITTED to reject" }, { status: 400 });

    await db
      .update(governanceDocuments)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(eq(governanceDocuments.id, doc.id));

    await logGovernanceAudit(orgId, user.id ?? null, "governance_document_rejected", "governance_document", doc.id, {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
