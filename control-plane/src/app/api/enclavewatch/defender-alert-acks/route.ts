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
 * GET /api/enclavewatch/defender-alert-acks?since=&until=
 *
 * Vault-facing endpoint: returns the acknowledgment status for high/critical
 * Microsoft Defender for Endpoint alerts in [since, until] so the ISSO can
 * populate `previous_period_acknowledgments_review.items[]` in the next
 * weekly manifest with Defender-alert outcomes alongside break-glass,
 * privileged-grant, and configuration-drift outcomes.
 *
 * Mirrors `/api/enclavewatch/break-glass-acks`,
 * `/api/enclavewatch/privileged-grant-acks`, and
 * `/api/enclavewatch/config-drift-acks` — same shape, same query semantics,
 * same status enum, different entry type.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 *
 * SLA: Defender alerts have a 24-hour ack window (vs 72h on lower-severity
 * surfaces) — overdue threshold tightened accordingly.
 *
 * Phase 3 of Register-Automation v1.1.
 */

const ACK_STALE_HOURS = 24;

interface AckItem {
  alert_id: string;
  ack_status: "acknowledged" | "draft_pending" | "disputed" | "overdue_no_ack";
  lifecycle_state: string | null;
  acknowledged_by: string | null;
  signed_at: string | null;
  business_justification: string | null;
  outcome: string | null;
  actions_taken: string | null;
  alert_title: string | null;
  severity: string | null;
  category: string | null;
  event_type: string | null;
  system: string | null;
  affected_assets: string[] | null;
  mitre_techniques: string[] | null;
  graph_alert_url: string | null;
  occurred_at: string | null;
  detected_at: string | null;
  draft_age_hours: number;
  raw_alert_id: string | null;
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

  const candidates = resolveRegisterKeyCandidates("incident_log");
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
        eq(governanceRegisterEntries.entryType, "defender_alert_acknowledgment"),
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
      acknowledged_by:
        (data.actor_signed_by_user_name as string | null | undefined) ?? null,
      signed_at: (data.signed_at as string | null | undefined) ?? null,
      business_justification:
        (data.business_justification as string | null | undefined) ?? null,
      outcome: (data.outcome as string | null | undefined) ?? null,
      actions_taken: (data.actions_taken as string | null | undefined) ?? null,
      alert_title:
        (data.actor_alert_title as string | null | undefined) ?? null,
      severity: (data.severity as string | null | undefined) ?? null,
      category: (data.category as string | null | undefined) ?? null,
      event_type: (data.event_type as string | null | undefined) ?? null,
      system: (data.system as string | null | undefined) ?? null,
      affected_assets: (data.affected_assets as string[] | null | undefined) ?? null,
      mitre_techniques:
        (data.mitre_techniques as string[] | null | undefined) ?? null,
      graph_alert_url:
        (data.graph_alert_url as string | null | undefined) ?? null,
      occurred_at: (data.occurred_at as string | null | undefined) ?? null,
      detected_at: (data.detected_at as string | null | undefined) ?? null,
      draft_age_hours: draftAgeHours,
      raw_alert_id: (data.raw_alert_id as string | null | undefined) ?? null,
    };
  });

  return NextResponse.json({
    items,
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
}
