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
 * GET /api/registers/change-log/recent?since=&until=
 *
 * Vault-facing endpoint: lets EnclaveWatch's ConfigurationDriftCollector
 * pull recent change_log entries so each Sysmon-detected baseline change
 * can be correlated against logged changes within ±60 minutes. Drift =
 * a Sysmon event that doesn't match any logged change in the window.
 *
 * Returns lightweight projection (no PII / no command-line text). Drops
 * `entryData` keys that aren't needed for correlation. The collector
 * works against (path, occurred_at, change_type) triples.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 *
 * Phase 2 of Register-Automation v1.1.
 */

interface RecentChangeLogItem {
  entry_id: string;
  entry_type: string | null;
  status: "draft" | "final" | "void" | string;
  occurred_at: string | null;
  /**
   * Best-effort path / target string extracted from entryData. The
   * change_log schema has multiple entry types (change_request,
   * change_approved, change_implemented, change_backout) and they don't
   * all carry a uniform "path" field. The collector handles partial
   * matches via fuzzy substring + change_summary keywords.
   */
  path: string | null;
  change_summary: string | null;
  system: string | null;
  change_id: string | null;
  approval_decision: string | null;
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

  // Resolve change_log register (alias-aware).
  const candidates = resolveRegisterKeyCandidates("change_log");
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

  const registerIds = matchingRegisters.map((r) => r.id);

  // Pull change_log entries with timestamps in the window. We filter by
  // createdAt server-side to keep the query simple, then refine on the
  // entry-type-specific timestamp client-side (each entry type has its
  // own time field — change_request.requested_at, change_approved.
  // approved_at, change_implemented.implemented_at, change_backout.
  // backed_out_at).
  const rows = await db
    .select({
      id: governanceRegisterEntries.id,
      entryType: governanceRegisterEntries.entryType,
      status: governanceRegisterEntries.status,
      entryData: governanceRegisterEntries.entryData,
      createdAt: governanceRegisterEntries.createdAt,
    })
    .from(governanceRegisterEntries)
    .where(
      and(
        sql`${governanceRegisterEntries.registerId} IN (${sql.join(
          registerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        gte(governanceRegisterEntries.createdAt, sinceDate),
        lte(governanceRegisterEntries.createdAt, untilDate),
      ),
    );

  function pickTimestamp(
    entryType: string | null,
    data: Record<string, unknown>,
  ): string | null {
    const t =
      entryType === "change_request"
        ? data.requested_at
        : entryType === "change_approved"
          ? data.approved_at
          : entryType === "change_implemented"
            ? data.implemented_at
            : entryType === "change_backout"
              ? data.backed_out_at
              : null;
    return typeof t === "string" ? t : null;
  }

  function pickPath(data: Record<string, unknown>): string | null {
    // The change_log schema doesn't have a uniform "path" field — the
    // collector should pattern-match against change_summary. We surface
    // a few candidate fields the operator might have used.
    const candidates = [
      data.path,
      data.target,
      data.target_path,
      data.affected_path,
      data.system,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() !== "") return c;
    }
    return null;
  }

  const items: RecentChangeLogItem[] = rows.map((r) => {
    const data = (r.entryData ?? {}) as Record<string, unknown>;
    const occurred = pickTimestamp(r.entryType ?? null, data);
    return {
      entry_id: r.id,
      entry_type: r.entryType ?? null,
      status: r.status ?? "draft",
      occurred_at: occurred,
      path: pickPath(data),
      change_summary:
        (data.change_summary as string | null | undefined) ??
        (data.implementation_summary as string | null | undefined) ??
        null,
      system: (data.system as string | null | undefined) ?? null,
      change_id: (data.change_id as string | null | undefined) ?? null,
      approval_decision:
        (data.approval_decision as string | null | undefined) ?? null,
    };
  });

  return NextResponse.json({
    items,
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
}
