import { NextResponse } from "next/server";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/governance-documents/uploaded-labels
 * Returns distinct artifact labels that the current org has uploaded (for Required Documents checklist and gating).
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const rows = await db
      .select({ artifactLabel: artifacts.artifactLabel })
      .from(artifacts)
      .where(eq(artifacts.organizationId, orgId));

    const uploadedLabels = [...new Set(rows.map((r) => r.artifactLabel))];
    return NextResponse.json({ uploadedLabels });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
