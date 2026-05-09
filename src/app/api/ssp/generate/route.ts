/**
 * POST /api/ssp/generate
 *
 * Generates a new SSP version for the caller's organization. Reads
 * canonical state for every control, composes AG-aligned sections
 * (per CA.L2-3.12.4 [a]–[h]), pins evidence citations with SHA-256,
 * canonicalizes the JSON, and persists to ssp_documents +
 * ssp_section_revisions + ssp_evidence_citations.
 *
 * The new row lands in status='draft'. A subsequent POST to
 * /api/ssp/[id]/sign (Phase C2) signs it with the Codex key and
 * marks 'signed', superseding any prior signed version.
 *
 * Auth: Admin only (SSP issuance is a sign-off action).
 */
import { NextRequest, NextResponse } from "next/server";

import { requireOrg, requireRole } from "@/lib/auth";
import { generateSsp } from "@/lib/ssp/generate";

export async function POST(req: NextRequest) {
  let orgId: string;
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const boundaryId =
    typeof body?.boundaryId === "string" ? body.boundaryId : undefined;

  try {
    const result = await generateSsp({
      organizationId: orgId,
      boundaryId,
      triggeredByUserId: user.id,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "SSP generation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
