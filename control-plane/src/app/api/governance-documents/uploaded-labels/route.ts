import { NextResponse } from "next/server";
import { db } from "@/db";
import { artifacts, governanceArtifactCompletions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/governance-documents/uploaded-labels
 * Returns distinct artifact labels that the current org has uploaded or assigned (for Documents matrix and gating).
 * Includes: labels from artifacts (file uploads) and from governance_artifact_completions (assigned/reference).
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [uploadRows, assignedRows] = await Promise.all([
      db
        .select({ artifactLabel: artifacts.artifactLabel })
        .from(artifacts)
        .where(eq(artifacts.organizationId, orgId)),
      db
        .select({ artifactLabel: governanceArtifactCompletions.artifactLabel })
        .from(governanceArtifactCompletions)
        .where(eq(governanceArtifactCompletions.organizationId, orgId)),
    ]);

    const uploadedLabels = [
      ...new Set([
        ...uploadRows.map((r) => r.artifactLabel),
        ...assignedRows.map((r) => r.artifactLabel),
      ]),
    ];
    return NextResponse.json({ uploadedLabels });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
