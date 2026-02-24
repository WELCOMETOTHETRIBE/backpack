import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceDocuments } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";

/**
 * GET /api/governance/documents?type=...&status=...&domain=...&page=1&limit=20
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const domain = searchParams.get("domain");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const conditions = [eq(governanceDocuments.organizationId, orgId)];
    if (type) conditions.push(eq(governanceDocuments.type, type as "POLICY" | "SOP" | "PLAN" | "STANDARD" | "CHARTER" | "PROCEDURE" | "TEMPLATE"));
    if (status) conditions.push(eq(governanceDocuments.status, status as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "RETIRED"));
    if (domain) conditions.push(eq(governanceDocuments.domain, domain));

    const items = await db
      .select()
      .from(governanceDocuments)
      .where(and(...conditions))
      .orderBy(desc(governanceDocuments.updatedAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(governanceDocuments)
      .where(and(...conditions));

    return NextResponse.json({
      items,
      total: totalRow?.count ?? 0,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list documents";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/**
 * POST /api/governance/documents — create document (DRAFT).
 * Body: { docId, title, type, domain?, ownerId?, reviewCadenceDays? }
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json().catch(() => ({}));
    const docId = body.docId as string;
    const title = body.title as string;
    const type = body.type as string;
    const domain = body.domain as string | null;
    const ownerId = body.ownerId as string | null;
    const reviewCadenceDays = body.reviewCadenceDays as number | null;

    if (!docId?.trim() || !title?.trim() || !type) {
      return NextResponse.json({ error: "docId, title, and type are required" }, { status: 400 });
    }

    const validTypes = ["POLICY", "SOP", "PLAN", "STANDARD", "CHARTER", "PROCEDURE", "TEMPLATE"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const [doc] = await db
      .insert(governanceDocuments)
      .values({
        organizationId: orgId,
        docId: docId.trim(),
        title: title.trim(),
        type: type as "POLICY" | "SOP" | "PLAN" | "STANDARD" | "CHARTER" | "PROCEDURE" | "TEMPLATE",
        domain: domain?.trim() || null,
        status: "DRAFT",
        ownerId: ownerId || null,
        reviewCadenceDays: reviewCadenceDays ?? null,
      })
      .returning();

    await logGovernanceAudit(orgId, user.id ?? null, "governance_document_created", "governance_document", doc?.id ?? null, { docId, title });

    return NextResponse.json(doc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create document";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
