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
 * GET /api/enclavewatch/config-drift-acks?since=&until=
 *
 * Vault-facing endpoint: returns the justification status for
 * configuration-drift alerts in [since, until] so the ISSO can populate
 * `previous_period_acknowledgments_review.items[]` in the next weekly
 * manifest with drift outcomes alongside break-glass and privileged-grant
 * outcomes.
 *
 * Mirrors `/api/enclavewatch/break-glass-acks` and
 * `/api/enclavewatch/privileged-grant-acks` — same shape, same query
 * semantics, same status enum, different entry type.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 *
 * Phase 2 of Register-Automation v1.1 brief.
 */

const ACK_STALE_HOURS = 72;

interface AckItem {
  alert_id: string;
  ack_status: "acknowledged" | "draft_pending" | "disputed" | "overdue_no_ack";
  lifecycle_state: string | null;
  justified_by: string | null;
  signed_at: string | null;
  business_justification: string | null;
  outcome: string | null;
  actions_taken: string | null;
  path: string | null;
  change_type: string | null;
  host: string | null;
  actor_user: string | null;
  occurred_at: string | null;
  detected_at: string | null;
  draft_age_hours: number;
  related_change_log_entry_id: string | null;
  sysmon_event_id: number | null;
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

  const candidates = resolveRegisterKeyCandidates("change_drift_log");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (matchingRegisters.length === 0) {
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
          matchingRegisters.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.entryType, "change_drift_acknowledgment"),
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

    return {
      alert_id: alertId,
      ack_status: ackStatus,
      lifecycle_state: (data.lifecycle_state as string | undefined) ?? null,
      justified_by:
        (data.actor_signed_by_user_name as string | null | undefined) ?? null,
      signed_at: (data.signed_at as string | null | undefined) ?? null,
      business_justification:
        (data.business_justification as string | null | undefined) ?? null,
      outcome: (data.outcome as string | null | undefined) ?? null,
      actions_taken: (data.actions_taken as string | null | undefined) ?? null,
      path: (data.path as string | null | undefined) ?? null,
      change_type: (data.change_type as string | null | undefined) ?? null,
      host: (data.host as string | null | undefined) ?? null,
      actor_user: (data.actor_user as string | null | undefined) ?? null,
      occurred_at: (data.occurred_at as string | null | undefined) ?? null,
      detected_at: (data.detected_at as string | null | undefined) ?? null,
      draft_age_hours: draftAgeHours,
      related_change_log_entry_id:
        (data.related_change_log_entry_id as string | null | undefined) ?? null,
      sysmon_event_id:
        (data.sysmon_event_id as number | null | undefined) ?? null,
    };
  });

  return NextResponse.json({
    items,
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
}
