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
 * GET /api/enclavewatch/break-glass-acks?vault_id=&since=&until=
 *
 * Returns the ack status for break-glass alerts in [since, until] so the
 * vault can let the ISSO populate
 * `previous_period_acknowledgments_review.items[]` in the next manifest.
 *
 * Per the contract in docs/specs/isso-export-manifest-v1.1.md §11.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 *
 * Sprint 1 ships the endpoint shape with computed status semantics. The
 * underlying break_glass_acknowledgment entry type lands in Sprint 2 — until
 * then this returns an empty items[] (organization has zero break-glass
 * acknowledgment entries because the type doesn't exist yet).
 */

const ACK_STALE_HOURS = 72;

interface AckItem {
  alert_id: string;
  ack_status: "acknowledged" | "draft_pending" | "disputed" | "overdue_no_ack";
  acknowledged_by: string | null;
  signed_at: string | null;
  purpose_of_session: string | null;
  actions_taken: string | null;
  before_state: string | null;
  after_state: string | null;
  draft_age_hours: number;
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

  // Resolve maintenance_log register (alias-aware).
  const mlCandidates = resolveRegisterKeyCandidates("maintenance_log");
  const mlRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          mlCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (mlRegisters.length === 0) {
    return NextResponse.json({
      items: [],
      since: sinceDate.toISOString(),
      until: untilDate.toISOString(),
    });
  }

  // Pull every break_glass_acknowledgment entry in the window across any
  // matching register row (see lib/control-status.ts comment about
  // duplicate-row defensive aggregation).
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
          mlRegisters.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.entryType, "break_glass_acknowledgment"),
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
      acknowledged_by: (data.acknowledged_by as string | null) ?? null,
      signed_at: r.finalizedAt ? r.finalizedAt.toISOString() : null,
      purpose_of_session: (data.purpose_of_session as string | null) ?? null,
      actions_taken: (data.actions_taken as string | null) ?? null,
      before_state: (data.before_state as string | null) ?? null,
      after_state: (data.after_state as string | null) ?? null,
      draft_age_hours: draftAgeHours,
    };
  });

  return NextResponse.json({
    items,
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
}
