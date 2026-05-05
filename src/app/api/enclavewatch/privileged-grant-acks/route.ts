import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * GET /api/enclavewatch/privileged-grant-acks?since=&until=
 *
 * Returns the justification status for privileged-grant alerts in
 * [since, until] so the vault can let the ISSO populate
 * `previous_period_acknowledgments_review.items[]` in the next manifest
 * with privileged_grant outcomes alongside break-glass outcomes.
 *
 * Mirrors `/api/enclavewatch/break-glass-acks` (Sprint 1) — same shape,
 * same query semantics, same status enum, different entry type.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 *
 * Phase 1 of Register-Automation v1.1 brief.
 */

const ACK_STALE_HOURS = 72;

interface AckItem {
  alert_id: string;
  ack_status: "acknowledged" | "draft_pending" | "disputed" | "overdue_no_ack";
  /** Lifecycle marker — useful to ISSO for distinguishing draft/admin_signed/isso_verified at a glance. */
  lifecycle_state: string | null;
  justified_by: string | null;
  signed_at: string | null;
  business_justification: string | null;
  outcome: string | null;
  actions_taken: string | null;
  sunset_plan: string | null;
  expected_duration_days: number | null;
  actor_user: string | null;
  azure_role_name: string | null;
  scope_arm: string | null;
  occurred_at: string | null;
  detected_at: string | null;
  draft_age_hours: number;
  related_grant_entry_id: string | null;
}

export async function GET(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  if (!since || !until) {
    return NextResponse.json(
      { error: "since and until query params are required (RFC3339)" },
      { status: 400 },
    );
  }

  let sinceDate: Date;
  let untilDate: Date;
  try {
    sinceDate = new Date(since);
    untilDate = new Date(until);
    if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime())) {
      throw new Error("invalid date");
    }
  } catch {
    return NextResponse.json(
      { error: "since and until must be RFC3339 timestamps" },
      { status: 400 },
    );
  }

  // Resolve access_authorization register (alias-aware).
  const aaCandidates = resolveRegisterKeyCandidates("access_authorization");
  const aaRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          aaCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (aaRegisters.length === 0) {
    return NextResponse.json({
      items: [],
      since: sinceDate.toISOString(),
      until: untilDate.toISOString(),
    });
  }

  const rows = await db
    .select({
      id: governanceRegisterEntries.id,
      status: governanceRegisterEntries.status,
      finalizedAt: governanceRegisterEntries.finalizedAt,
      createdAt: governanceRegisterEntries.createdAt,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .where(
      and(
        sql`${governanceRegisterEntries.registerId} IN (${sql.join(
          aaRegisters.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.entryType, "privileged_grant_acknowledgment"),
        gte(governanceRegisterEntries.createdAt, sinceDate),
        lte(governanceRegisterEntries.createdAt, untilDate),
      ),
    );

  const now = Date.now();
  const items: AckItem[] = rows.map((r) => {
    const data = (r.entryData ?? {}) as Record<string, unknown>;
    const alertId = (data.alert_id as string | undefined) ?? r.id;
    const isFinal = r.status === "final";
    const draftAgeHours = Math.max(
      0,
      Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000),
    );

    let ackStatus: AckItem["ack_status"];
    if (isFinal) {
      ackStatus = "acknowledged";
    } else if (data.dispute_filed === true) {
      ackStatus = "disputed";
    } else if (draftAgeHours >= ACK_STALE_HOURS) {
      ackStatus = "overdue_no_ack";
    } else {
      ackStatus = "draft_pending";
    }

    const lifecycleState = (data.lifecycle_state as string | undefined) ?? null;

    return {
      alert_id: alertId,
      ack_status: ackStatus,
      lifecycle_state: lifecycleState,
      justified_by:
        (data.actor_signed_by_user_name as string | null | undefined) ?? null,
      signed_at: (data.signed_at as string | null | undefined) ?? null,
      business_justification:
        (data.business_justification as string | null | undefined) ?? null,
      outcome: (data.outcome as string | null | undefined) ?? null,
      actions_taken:
        (data.actions_taken as string | null | undefined) ?? null,
      sunset_plan: (data.sunset_plan as string | null | undefined) ?? null,
      expected_duration_days:
        (data.expected_duration_days as number | null | undefined) ?? null,
      actor_user: (data.actor_user as string | null | undefined) ?? null,
      azure_role_name:
        (data.azure_role_name as string | null | undefined) ?? null,
      scope_arm: (data.scope_arm as string | null | undefined) ?? null,
      occurred_at: (data.occurred_at as string | null | undefined) ?? null,
      detected_at: (data.detected_at as string | null | undefined) ?? null,
      draft_age_hours: draftAgeHours,
      related_grant_entry_id:
        (data.related_grant_entry_id as string | null | undefined) ?? null,
    };
  });

  return NextResponse.json({
    items,
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
}
