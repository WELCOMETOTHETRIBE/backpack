/**
 * POST /api/feedback/reset-stranded
 *
 * Admin recovery tool. Scans every feedback row marked status='resolved'
 * whose resolution_commit_sha is NOT reachable from origin/main, flips
 * those rows back to status='pending', and clears the resolution
 * metadata so the next agent run picks them up cleanly.
 *
 * This recovers from the historical bug where the agent pushed fixes to
 * a sandbox branch (e.g. claude/gifted-noether-XXXX) instead of main —
 * the feedback was marked "resolved" but Railway never saw the commit,
 * so prod never got the fix.
 *
 * Auth: Admin only. Idempotent: if every resolution_commit_sha is on
 * main, no rows change.
 *
 * Response shape:
 *   { scanned: N, stranded: M, reset: M, kept: N - M }
 */
import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { feedback } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { verifyCommitOnMain } from "@/lib/github-commit-verify";

export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin"]);

    // Pull every resolved row in this org that has a SHA recorded.
    const rows = await db
      .select({
        id: feedback.id,
        resolutionCommitSha: feedback.resolutionCommitSha,
        content: feedback.content,
      })
      .from(feedback)
      .where(
        and(
          eq(feedback.organizationId, orgId),
          eq(feedback.status, "resolved"),
          isNotNull(feedback.resolutionCommitSha),
        ),
      );

    let stranded = 0;
    const strandedDetail: Array<{ id: string; sha: string; reason: string }> = [];

    for (const row of rows) {
      const sha = row.resolutionCommitSha;
      if (!sha) continue;
      const verify = await verifyCommitOnMain(sha);
      if (verify.onMain) continue;
      stranded++;
      strandedDetail.push({
        id: row.id,
        sha,
        reason: verify.reason ?? `compare status: ${verify.status}`,
      });

      // Flip back to pending; clear resolution metadata so the next
      // agent run treats it as fresh work.
      await db
        .update(feedback)
        .set({
          status: "pending",
          resolvedAt: null,
          resolutionCommitSha: null,
          resolutionCommitUrl: null,
          resolutionSummary: null,
          resolutionFiles: [],
          updatedAt: new Date(),
        })
        .where(eq(feedback.id, row.id));
    }

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "feedback.reset_stranded",
      resourceType: "organization",
      resourceId: orgId,
      details: {
        scanned: rows.length,
        stranded,
        reset: stranded,
        kept: rows.length - stranded,
        // Truncate to 50 to keep the audit-log row sane in size.
        sample: strandedDetail.slice(0, 50),
      },
    });

    return NextResponse.json({
      ok: true,
      scanned: rows.length,
      stranded,
      reset: stranded,
      kept: rows.length - stranded,
      detail: strandedDetail,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/feedback/reset-stranded]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "reset-stranded failed" },
      { status: 500 },
    );
  }
}
