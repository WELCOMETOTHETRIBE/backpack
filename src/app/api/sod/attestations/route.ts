/**
 * SoD quarterly attestation endpoints.
 *
 *   GET  /api/sod/attestations          — list recent quarterly attestations
 *   POST /api/sod/attestations          — sign a new quarterly attestation;
 *                                          auto-closes open C-cell findings
 *                                          for the attested principals.
 *
 * The attestation is persisted as a `sod_matrix_review` register entry
 * with `entryData.source = "quarterly_attestation"`. See
 * `src/lib/sod/attestations.ts` for the helper layer.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sodFindings } from "@/db/schema";
import { requireOrg, requireRole, type SessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createQuarterlyAttestation,
  listAttestations,
  getLastAttestationAt,
} from "@/lib/sod/attestations";

interface AttestRequestBody {
  review_period_start?: unknown;
  review_period_end?: unknown;
  attested_principals?: unknown;
  result?: unknown;
  notes?: unknown;
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET() {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unauthorized" },
      { status: 401 },
    );
  }

  const [attestations, lastAt] = await Promise.all([
    listAttestations(orgId, 20),
    getLastAttestationAt(orgId),
  ]);

  const daysSinceLast = lastAt
    ? Math.floor((Date.now() - lastAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return NextResponse.json({
    attestations,
    last_attestation_at: lastAt?.toISOString() ?? null,
    days_since_last: daysSinceLast,
    /** Cadence target (calendar quarters ~ 90 days). UI may surface a
     *  due-in-N-days hint based on this. */
    cadence_target_days: 90,
  });
}

export async function POST(req: Request) {
  let orgId: string;
  let user: SessionUser;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin", "Compliance"]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unauthorized" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as AttestRequestBody;

  const periodStart = typeof body.review_period_start === "string" ? body.review_period_start : "";
  const periodEnd = typeof body.review_period_end === "string" ? body.review_period_end : "";
  if (!isYmd(periodStart) || !isYmd(periodEnd)) {
    return NextResponse.json(
      { error: "review_period_start and review_period_end (yyyy-mm-dd) required" },
      { status: 400 },
    );
  }
  if (periodStart > periodEnd) {
    return NextResponse.json(
      { error: "review_period_start must be <= review_period_end" },
      { status: 400 },
    );
  }

  const principalsRaw = Array.isArray(body.attested_principals) ? body.attested_principals : [];
  const attestedPrincipals = principalsRaw.filter((p): p is string => typeof p === "string" && p.length > 0);

  const result = typeof body.result === "string" ? body.result : "no_change";
  if (result !== "no_change" && result !== "exceptions_present") {
    return NextResponse.json(
      { error: "result must be 'no_change' or 'exceptions_present'" },
      { status: 400 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;

  const reviewerName = user.name?.trim() || user.email || "(unknown reviewer)";
  const reviewerUserId = user.id ?? null;

  // Atomic: create the register entry + auto-close matching C-findings in
  // the same transaction so an assessor never sees a closed finding
  // without its attestation, or vice-versa.
  const created = await db.transaction(async (tx) => {
    const cr = await createQuarterlyAttestation(tx, {
      organizationId: orgId,
      reviewerName,
      reviewerUserId,
      reviewPeriodStart: periodStart,
      reviewPeriodEnd: periodEnd,
      attestedPrincipals,
      result: result as "no_change" | "exceptions_present",
      notes,
    });
    if (cr.kind !== "created") return { attestation: cr, autoClosed: [] as string[] };

    if (attestedPrincipals.length === 0) {
      return { attestation: cr, autoClosed: [] as string[] };
    }

    // Auto-close any open C_no_attestation findings for the attested principals.
    const justification = `Closed by quarterly SoD attestation ${cr.entryId} signed by ${reviewerName} on ${new Date().toISOString().slice(0, 10)}.`;
    const closedRows = await tx
      .update(sodFindings)
      .set({
        status: "justified",
        closedAt: new Date(),
        closedById: reviewerUserId,
        justificationText: justification,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sodFindings.organizationId, orgId),
          eq(sodFindings.status, "open"),
          eq(sodFindings.dispositionType, "C_no_attestation"),
          inArray(sodFindings.subjectPrincipal, attestedPrincipals),
        ),
      )
      .returning({ id: sodFindings.id });

    return { attestation: cr, autoClosed: closedRows.map((r) => r.id) };
  });

  if (created.attestation.kind !== "created") {
    return NextResponse.json(
      { error: `failed to create attestation: ${created.attestation.reason}` },
      { status: 500 },
    );
  }

  try {
    await writeAuditLog({
      organizationId: orgId,
      action: "sod.quarterly_attestation.signed",
      resourceType: "governance_register_entry",
      resourceId: created.attestation.entryId,
      details: {
        reviewer: reviewerName,
        reviewer_user_id: reviewerUserId,
        review_period_start: periodStart,
        review_period_end: periodEnd,
        result,
        attested_principals_count: attestedPrincipals.length,
        attested_principals: attestedPrincipals,
        auto_closed_finding_count: created.autoClosed.length,
      },
    });
  } catch (err) {
    console.error("[sod-attestation] audit log write failed:", err);
  }

  return NextResponse.json({
    entry_id: created.attestation.entryId,
    auto_closed_finding_ids: created.autoClosed,
    auto_closed_count: created.autoClosed.length,
  });
}
