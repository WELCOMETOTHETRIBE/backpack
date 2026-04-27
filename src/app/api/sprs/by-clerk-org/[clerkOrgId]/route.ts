import { NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";

import { db } from "@/db";
import { organizations, controlRecords } from "@/db/schema";

/**
 * GET /api/sprs/by-clerk-org/{clerkOrgId}
 *
 * Server-to-server SPRS lookup for sibling products (CaptureOS today,
 * future tools). Authenticated via shared bearer secret in
 * Authorization: Bearer <CAPTUREOS_API_TOKEN>. The token is rotated
 * out-of-band and stored as an env var on both Codex and the consuming
 * service.
 *
 * Returns the rollup score from organizations.sprsScore plus the
 * latest control-level assessmentDate so consumers can show "last
 * assessed YYYY-MM-DD" without computing it themselves.
 *
 * Response shape (stable contract — CaptureOS depends on this):
 *   200 {
 *     clerkOrgId, organizationId, score, max,
 *     assessment_date | null, source_url, last_updated
 *   }
 *   401 — missing or wrong bearer token
 *   404 — org not found by that clerkOrgId
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ clerkOrgId: string }> }
) {
  const expected = process.env.CAPTUREOS_API_TOKEN;
  if (!expected) {
    // Fail closed — never serve this if the secret isn't configured.
    return NextResponse.json(
      { error: "CAPTUREOS_API_TOKEN not configured on Codex" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clerkOrgId } = await ctx.params;
  if (!clerkOrgId) {
    return NextResponse.json(
      { error: "clerkOrgId is required" },
      { status: 400 }
    );
  }

  const org = (
    await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        sprsScore: organizations.sprsScore,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1)
  )[0];

  if (!org) {
    return NextResponse.json(
      { error: "no organization for that clerkOrgId" },
      { status: 404 }
    );
  }

  // Latest control-level assessment date — closest thing to a tenant-
  // level "last assessed" until Codex adds a rollup field.
  const lastAssessedRow = (
    await db
      .select({ latest: max(controlRecords.assessmentDate) })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, org.id))
  )[0];

  const baseUrl =
    process.env.NEXTAUTH_URL ?? "https://codex.mactechsolutionsllc.com";
  const sourceUrl = `${baseUrl}/dashboard/readiness`;

  return NextResponse.json({
    clerkOrgId,
    organizationId: org.id,
    score: org.sprsScore,
    max: 110,
    assessment_date: lastAssessedRow?.latest ?? null,
    source_url: sourceUrl,
    last_updated:
      lastAssessedRow?.latest ??
      (org.createdAt instanceof Date
        ? org.createdAt.toISOString()
        : org.createdAt ?? null),
  });
}
