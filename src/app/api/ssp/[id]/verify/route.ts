/**
 * GET /api/ssp/[id]/verify
 *
 * The "one button the C3PAO presses." Re-derives every cited evidence
 * row's current SHA-256, compares against the hashes pinned at SSP
 * generation time, and reports per-section divergence.
 *
 * Three top-level outcomes:
 *   identical — every section's evidence still hashes to its pinned
 *               value; the signed SSP is defensible against current
 *               state.
 *   drift     — at least one section has drifted. The response lists
 *               which sections + which citations changed so the
 *               operator can decide whether to re-issue.
 *   invalid   — the signature won't validate (tamper or malformed).
 *
 * Auth: Admin / Compliance / Assessor.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sspDocuments } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { computeDriftReport } from "@/lib/ssp/drift";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }

  const [doc] = await db
    .select({ id: sspDocuments.id })
    .from(sspDocuments)
    .where(and(eq(sspDocuments.id, id), eq(sspDocuments.organizationId, orgId)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const report = await computeDriftReport(doc.id);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    sspDocumentId: report.sspDocumentId,
    payloadSha256: report.payloadSha256,
    signedAt: report.signedAt,
    signatureValid: report.signatureValid,
    signatureReason: report.signatureReason,
    topLevel: report.topLevel,
    sectionsByOutcome: {
      identical: report.sections.filter((s) => s.outcome === "identical").length,
      drift: report.sections.filter((s) => s.outcome === "drift").length,
      missing: report.sections.filter((s) => s.outcome === "missing").length,
    },
    // Only emit detail rows for non-identical sections — keeps the
    // payload tight when nothing's changed, which is the common case.
    diverging: report.sections
      .filter((s) => s.outcome !== "identical")
      .map((s) => ({
        sectionRevisionId: s.sectionRevisionId,
        sectionKind: s.sectionKind,
        sectionKey: s.sectionKey,
        outcome: s.outcome,
        driftingCitationCount: s.driftingCitationCount,
        missingCitationCount: s.missingCitationCount,
        details: s.details.filter((d) => d.state !== "identical"),
      })),
  });
}
