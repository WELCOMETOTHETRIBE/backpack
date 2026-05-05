import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controls, controlFamilies } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";

/**
 * GET /api/enclavewatch/isso-review-checklist?vault_id=&period_end=
 *
 * Returns the candidate control list for ISSO weekly review. Vault renders
 * the response as a checkbox UI; checked control_ids become
 * `control_freshness.freshly_observed_implemented[]` in the next manifest.
 *
 * Per the contract in docs/specs/isso-export-manifest-v1.1.md §12.
 *
 * Filter logic:
 *   - Includes: controls observable during weekly review (operational lanes)
 *   - Excludes: inherited (vendor SRM does the work), not_applicable, and
 *     pure-attestation one-shot artifacts (where ISSO observation isn't a
 *     thing — e.g. the SSP itself).
 *
 * Stale flag: days_since_last_evaluation > 90 → is_stale = true. Vault UI
 * should highlight stale controls so ISSO addresses them first.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 */

const STALE_DAYS = 90;
const MS_PER_DAY = 86_400_000;

interface ChecklistEntry {
  control_id: string;
  title: string;
  family: string;
  last_evaluated_at: string | null;
  days_since_last_evaluation: number;
  is_stale: boolean;
  review_hint: string;
}

/**
 * Per-control hint shown next to the checkbox so the ISSO knows what to
 * verify. Falls back to a generic message when the control isn't in this
 * map. Sprint 1 ships a curated set covering the most relevant operational
 * controls; Sprint 5 expands as we expand handler coverage.
 */
const REVIEW_HINTS: Record<string, string> = {
  "3.1.5": "Confirm least-privilege on all admin grants observed this period",
  "3.1.6": "Confirm non-privileged accounts have not been used for admin work",
  "3.1.7": "Confirm logs were reviewed and no anomalies outstanding",
  "3.3.2": "Confirm audit records retain content sufficient to identify each event source",
  "3.3.3": "Confirm audit log integrity protections (immutable storage / hash chains) operating",
  "3.3.5": "Confirm audit review and analysis happened on the documented cadence",
  "3.6.1": "Confirm any incidents this period had documented response actions",
  "3.6.2": "Confirm incidents were tracked through closure with root-cause notes",
  "3.7.1": "Confirm planned maintenance was performed and recorded",
  "3.7.2": "Confirm maintenance personnel met required clearances/oversight",
  "3.7.5": "Confirm any nonlocal maintenance sessions were authorized + supervised",
  "3.11.2": "Confirm vuln scans ran on cadence and findings tracked",
  "3.11.3": "Confirm critical vulns were remediated or risk-accepted with ISSO sign-off",
  "3.12.3": "Confirm continuous monitoring activities operated as designed",
  "3.12.4": "Confirm any policy revisions in the period were reviewed/approved",
  "3.14.1": "Confirm flaw remediation cadence honored (patching SLAs)",
  "3.14.3": "Confirm security alerts were reviewed and routed appropriately",
  "3.14.6": "Confirm communications monitoring alerts (Defender, Sysmon) were reviewed",
  "3.14.7": "Confirm review of unauthorized-use indicators (failed logons, off-hours, etc.)",
};

export async function GET(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const periodEndParam = url.searchParams.get("period_end");
  let periodEnd: Date;
  try {
    periodEnd = periodEndParam ? new Date(periodEndParam) : new Date();
    if (Number.isNaN(periodEnd.getTime())) throw new Error("invalid period_end");
  } catch {
    return NextResponse.json(
      { error: "period_end must be RFC3339 if provided" },
      { status: 400 },
    );
  }

  // Build candidate set from CONTROL_INTELLIGENCE: filter to operational
  // controls (skip inherited / N/A / pure-attestation one-shots).
  const candidateIds = CONTROL_INTELLIGENCE.filter((intel) => {
    if (intel.disposition === "inherited") return false;
    if (intel.disposition === "not_applicable") return false;
    if (!intel.cadenceType) return false;
    // Cadence types that don't make sense for weekly review are excluded.
    // "annual"/"continuous"/"per_event"/"monthly"/"quarterly"/"ongoing" all
    // benefit from periodic ISSO observation; "one_time" and "na" do not.
    if (intel.cadenceType === "na") return false;
    if (intel.cadenceType === "one_time") return false;
    return true;
  }).map((intel) => intel.controlId);

  if (candidateIds.length === 0) {
    return NextResponse.json({ controls: [], period_end: periodEnd.toISOString() });
  }

  // Pull current state from control_records (joined with controls + families
  // for title and family code).
  const rows = await db
    .select({
      controlId: controlRecords.controlId,
      updatedAt: controlRecords.updatedAt,
      title: controls.title,
      family: controlFamilies.code,
    })
    .from(controlRecords)
    .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(
      and(
        eq(controlRecords.organizationId, ctx.orgId),
        inArray(controlRecords.controlId, candidateIds),
      ),
    );

  const byControlId = new Map(rows.map((r) => [r.controlId, r]));
  const now = periodEnd.getTime();

  const controlsOut: ChecklistEntry[] = candidateIds
    .map((cid) => {
      const r = byControlId.get(cid);
      if (!r) return null;
      const lastEval = r.updatedAt;
      const days = lastEval
        ? Math.floor((now - new Date(lastEval).getTime()) / MS_PER_DAY)
        : Number.MAX_SAFE_INTEGER;
      return {
        control_id: cid,
        title: r.title ?? cid,
        family: r.family ?? cid.split(".")[1] ?? "?",
        last_evaluated_at: lastEval ? new Date(lastEval).toISOString() : null,
        days_since_last_evaluation: days,
        is_stale: days > STALE_DAYS,
        review_hint:
          REVIEW_HINTS[cid] ??
          "Confirm operational evidence for this control was observed this period",
      };
    })
    .filter((x): x is ChecklistEntry => x !== null)
    // Stale ones first so the ISSO sees them up top.
    .sort((a, b) => {
      if (a.is_stale !== b.is_stale) return a.is_stale ? -1 : 1;
      return b.days_since_last_evaluation - a.days_since_last_evaluation;
    });

  return NextResponse.json({
    controls: controlsOut,
    period_end: periodEnd.toISOString(),
  });
}
