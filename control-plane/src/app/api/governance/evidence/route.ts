import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceEvidenceItems, controlRecords, governanceControlLinks } from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/governance/evidence?evidence_type=...&controlId=...&stale=1&page=1&limit=20
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const evidenceType = searchParams.get("evidence_type");
    const controlId = searchParams.get("controlId");
    const stale = searchParams.get("stale") === "1";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const conditions = [eq(governanceEvidenceItems.organizationId, orgId)];
    if (evidenceType) conditions.push(eq(governanceEvidenceItems.evidenceType, evidenceType as "screenshot" | "export_file" | "log_snippet" | "config_baseline" | "policy_export" | "ticket" | "training_record" | "incident_report" | "risk_report" | "other"));

    if (controlId) {
      const records = await db.select({ id: controlRecords.id }).from(controlRecords).where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, controlId)));
      const recordIds = records.map((r) => r.id);
      if (recordIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, limit });
      }
      const links = await db.select({ linkId: governanceControlLinks.linkId }).from(governanceControlLinks).where(and(inArray(governanceControlLinks.controlRecordId, recordIds), eq(governanceControlLinks.linkType, "evidence")));
      const evidenceIds = [...new Set(links.map((l) => l.linkId))];
      if (evidenceIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, limit });
      }
      conditions.push(inArray(governanceEvidenceItems.id, evidenceIds));
    }

    let items = await db
      .select()
      .from(governanceEvidenceItems)
      .where(and(...conditions))
      .orderBy(desc(governanceEvidenceItems.collectedAt))
      .limit(stale ? 2000 : limit + 1)
      .offset(stale ? 0 : offset);

    if (stale) {
      const now = new Date();
      items = items.filter((i) => {
        if (!i.validityPeriodDays) return false;
        const end = new Date(i.collectedAt);
        end.setDate(end.getDate() + i.validityPeriodDays);
        return end < now;
      });
      const totalStale = items.length;
      items = items.slice(offset, offset + limit);
      const list = items.map((i) => {
        const end = i.validityPeriodDays
          ? (() => {
              const d = new Date(i.collectedAt);
              d.setDate(d.getDate() + i.validityPeriodDays);
              return d;
            })()
          : null;
        return {
          ...i,
          validityEnd: end?.toISOString() ?? null,
          isStale: true,
        };
      });
      return NextResponse.json({ items: list, total: totalStale, page, limit });
    }

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(governanceEvidenceItems)
      .where(and(...conditions));

    const list = items.slice(0, limit).map((i) => {
      const end = i.validityPeriodDays
        ? (() => {
            const d = new Date(i.collectedAt);
            d.setDate(d.getDate() + i.validityPeriodDays);
            return d;
          })()
        : null;
      const isStale = end ? end < new Date() : false;
      return {
        ...i,
        validityEnd: end?.toISOString() ?? null,
        isStale,
      };
    });

    return NextResponse.json({
      items: list,
      total: totalRow?.count ?? 0,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/**
 * POST /api/governance/evidence — create evidence item.
 * Body: { title, evidenceType, sourceSystem?, collectedById?, collectedAt?, validityPeriodDays?, implementationStatement?, controlIds?: string[] }
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json().catch(() => ({}));
    const title = body.title as string;
    const evidenceType = body.evidenceType as string;
    if (!title?.trim() || !evidenceType) {
      return NextResponse.json({ error: "title and evidenceType required" }, { status: 400 });
    }

    const validTypes = [
      "screenshot", "export_file", "log_snippet", "config_baseline", "policy_export",
      "ticket", "training_record", "incident_report", "risk_report", "other",
    ];
    if (!validTypes.includes(evidenceType)) {
      return NextResponse.json({ error: "Invalid evidenceType" }, { status: 400 });
    }

    const [item] = await db
      .insert(governanceEvidenceItems)
      .values({
        organizationId: orgId,
        title: title.trim(),
        evidenceType: evidenceType as "screenshot" | "export_file" | "log_snippet" | "config_baseline" | "policy_export" | "ticket" | "training_record" | "incident_report" | "risk_report" | "other",
        sourceSystem: (body.sourceSystem as string) || null,
        collectedById: (body.collectedById as string) || user.id || null,
        collectedAt: body.collectedAt ? new Date(body.collectedAt) : new Date(),
        validityPeriodDays: typeof body.validityPeriodDays === "number" ? body.validityPeriodDays : null,
        implementationStatement: (body.implementationStatement as string) || null,
      })
      .returning();

    const controlIds = (body.controlIds as string[]) ?? [];
    if (controlIds.length > 0 && item) {
      const { controlRecords: cr, governanceControlLinks: gcl } = await import("@/db/schema");
      const records = await db
        .select({ id: cr.id })
        .from(cr)
        .where(and(eq(cr.organizationId, orgId), inArray(cr.controlId, controlIds)));
      for (const r of records) {
        await db.insert(gcl).values({
          controlRecordId: r.id,
          linkType: "evidence",
          linkId: item.id,
        });
      }
    }

    return NextResponse.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
