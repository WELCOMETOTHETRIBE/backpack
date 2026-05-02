import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries, controlRecords } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/evidence-engine/api-errors";
import { requireBoundaryForOrg } from "@/lib/evidence-engine/validate-boundary";
import { logGovernanceAudit } from "@/lib/governance/audit";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import {
  resolveRegisterKeyCandidates,
  schemaIdForRegisterKey,
} from "@/data/cmmc/register-key-aliases";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * Registers where "empty is correct" isn't true: technical_compliance_run's
 * register represents OS Collector runs, not events. Empty there means the
 * collector has never run — a gap, not a satisfied state. (No control
 * references it today; this is defensive.)
 */
const ATTESTATION_EXCLUDED = new Set<string>(["technical_compliance_run"]);

/**
 * POST /api/evidence-engine/registers/[registerKey]/attest-no-events
 *
 * Captures a signed, dated "no events this period" attestation for an
 * event-driven register (cadence_days = 0). Writes a governance_register_entry
 * row with:
 *   entryType  = "no_events_attestation"
 *   status     = "final"
 *   finalizedAt = now
 *   approvedById / createdById = session user
 *   entryData  = { period_start, period_end, rationale?, attested_by_name,
 *                  attested_by_role, declaration }
 *
 * This is the artifact a C3PAO examines when asking "how do you know
 * no incidents / terminations / etc. occurred during the assessment period?"
 * It creates a named, accountable record so an empty register isn't just
 * hand-waving.
 *
 * Body:
 *   { boundary_id: string, period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD",
 *     rationale?: string }
 *
 * Auth: Admin or Compliance. Guarded to event-driven registers only.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ registerKey: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { registerKey } = await params;
    if (!registerKey) return errorResponse("registerKey required", 400);

    // Only event-driven registers accept this attestation.
    const schemaId = schemaIdForRegisterKey(registerKey);
    if (ATTESTATION_EXCLUDED.has(schemaId)) {
      return errorResponse(
        "This register is not event-driven — attestation of 'no events' is not applicable.",
        400,
        { code: "NOT_EVENT_DRIVEN" }
      );
    }
    const cadence = getCadenceRuleByRegisterId(schemaId);
    if (!cadence || cadence.cadence_days !== 0) {
      return errorResponse(
        "This register has a scheduled cadence — it expects ongoing entries, not an attestation of no events.",
        400,
        { code: "NOT_EVENT_DRIVEN" }
      );
    }

    const body = await req.json().catch(() => ({}));
    const boundaryId = (body.boundary_id ?? body.boundaryId) as string | undefined;
    const boundaryResult = await requireBoundaryForOrg(orgId, boundaryId);
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;

    const periodStart = typeof body.period_start === "string" ? body.period_start : null;
    const periodEnd = typeof body.period_end === "string" ? body.period_end : null;
    const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";

    if (!periodStart || !periodEnd) {
      return errorResponse("period_start and period_end (YYYY-MM-DD) are required", 400, {
        code: "VALIDATION_ERROR",
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      return errorResponse("period_start / period_end must be YYYY-MM-DD", 400, {
        code: "VALIDATION_ERROR",
      });
    }
    if (new Date(periodStart).getTime() > new Date(periodEnd).getTime()) {
      return errorResponse("period_start must be on or before period_end", 400, {
        code: "VALIDATION_ERROR",
      });
    }

    // Locate the org's register row via alias resolver (seed vs schema keys diverge).
    const candidates = resolveRegisterKeyCandidates(registerKey);
    const [register] = await db
      .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey, name: governanceRegisters.name })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          inArray(governanceRegisters.registerKey, candidates)
        )
      )
      .limit(1);
    if (!register) return errorResponse("Register not provisioned for this org", 404);

    const now = new Date();
    const attestedByName = (user as { name?: string | null }).name ?? null;
    const attestedByRole = (user as { role?: string | null }).role ?? null;

    // Standard assessor-facing declaration. Intentionally explicit so it
    // carries over into any CSV export the C3PAO reviews.
    const declaration =
      `I attest, on behalf of the organization, that no events requiring an entry ` +
      `in the "${register.name}" register occurred within the defined CUI boundary ` +
      `between ${periodStart} and ${periodEnd}. Records supporting this assertion ` +
      `have been reviewed and are retained in accordance with the organization's ` +
      `record-retention policy.`;

    const [entry] = await db
      .insert(governanceRegisterEntries)
      .values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryType: "no_events_attestation",
        status: "final",
        finalizedAt: now,
        approvedById: user.id ?? null,
        createdById: user.id ?? null,
        entryData: {
          period_start: periodStart,
          period_end: periodEnd,
          rationale: rationale || null,
          attested_by_name: attestedByName,
          attested_by_role: attestedByRole,
          declaration,
        },
        hold: 0,
      })
      .returning();

    await logGovernanceAudit(
      orgId,
      user.id ?? null,
      "governance_register_entry_attested_no_events",
      "governance_register_entry",
      entry?.id ?? null,
      { registerKey: register.registerKey, period_start: periodStart, period_end: periodEnd }
    );
    if (entry?.id) {
      await logEntryEvent(orgId, entry.id, boundary.id, "finalized", user.id ?? null, {
        entry_type: "no_events_attestation",
      });
    }

    // Recalculate dependent controls so the new final entry flows into the
    // dashboard's "Controls Implemented" count immediately. Scope: every
    // control that references this register via CONTROL_INTELLIGENCE.
    const dependentControlIds = CONTROL_INTELLIGENCE
      .filter((c) => c.registerSchemaId === schemaId && c.registerRequired)
      .map((c) => c.controlId);
    let recalculated = 0;
    let promoted = 0;
    if (dependentControlIds.length > 0) {
      const records = await db
        .select({ id: controlRecords.id, implementationStatus: controlRecords.implementationStatus })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            inArray(controlRecords.controlId, dependentControlIds)
          )
        );
      for (const rec of records) {
        if (["assessed", "inherited", "not_applicable"].includes(rec.implementationStatus)) continue;
        const wasBefore = rec.implementationStatus;
        const newStatus = await calculateControlStatus(rec.id).catch(() => null);
        if (newStatus) {
          recalculated++;
          if (wasBefore !== "implemented" && newStatus === "implemented") promoted++;
        }
      }
    }

    // Invalidate the cached render of the register entries page so
    // router.refresh() on the client actually shows the new attestation
    // row instead of a stale server response.
    revalidatePath(`/dashboard/evidence-engine/registers/${registerKey}`);
    revalidatePath(`/dashboard/evidence-engine/registers/${register.registerKey}`);

    return NextResponse.json({
      entry,
      recalculated,
      promoted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}
