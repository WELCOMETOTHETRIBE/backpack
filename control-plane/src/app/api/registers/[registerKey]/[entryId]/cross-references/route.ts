import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceRegisterEntries,
  governanceRegisters,
  auditLogs,
  issoExportManifests,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * GET /api/registers/[registerKey]/[entryId]/cross-references
 *
 * Phase 5 of Register-Automation v1.1 brief — cross-reference graph.
 *
 * Returns the navigable chain of related events for a single entry so an
 * auditor can pivot from the entry to:
 *   - The audit_log rows for detection / admin signature / ISSO closure
 *   - The signed manifest_id receipt that delivered each
 *   - Any related register entries (evidence_refs[type=related_entry_id]
 *     and entries that share the same alert_id)
 *
 * Response shape (per blueprint §8):
 *   {
 *     entry_id, alert_id, manifest_id,
 *     audit_log_chain: [{ id, action, occurred_at, actor }, ...],
 *     related_entries: [{ register_key, entry_id, entry_type, label }, ...],
 *     manifest_history: [{ manifest_id, received_at, sections_processed }, ...]
 *   }
 *
 * Auth: session (any authenticated user in the org). The entry's
 * organization is verified before any cross-org data is returned.
 */

interface AuditLogRow {
  id: string;
  action: string;
  occurred_at: string;
  actor: string | null;
  details: Record<string, unknown> | null;
}

interface RelatedEntry {
  register_key: string;
  entry_id: string;
  entry_type: string | null;
  status: string;
  label: string;
}

interface ManifestHistoryRow {
  manifest_id: string;
  received_at: string;
  sections_processed: string[];
  controls_touched: string[];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ registerKey: string; entryId: string }> },
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entryId } = await params;

  // Resolve the entry + verify org membership.
  const [row] = await db
    .select({
      entryId: governanceRegisterEntries.id,
      entryType: governanceRegisterEntries.entryType,
      entryData: governanceRegisterEntries.entryData,
      registerKey: governanceRegisters.registerKey,
      orgId: governanceRegisters.organizationId,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisterEntries.registerId, governanceRegisters.id),
    )
    .where(eq(governanceRegisterEntries.id, entryId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (row.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = (row.entryData ?? {}) as Record<string, unknown>;
  const alertId = (data.alert_id as string | undefined) ?? null;
  const manifestId = (data.manifest_id as string | undefined) ?? null;
  const evidenceRefs = Array.isArray(data.evidence_refs)
    ? (data.evidence_refs as Array<Record<string, unknown>>)
    : [];

  // ── Audit-log chain ────────────────────────────────────────────────────
  // Fetch every audit_log row that references the same resource (by
  // alert_id when present; otherwise by entry id). The Phase-1/2/3 ack
  // chains use alert_id as resourceId, so this is the natural pivot.
  const resourceCandidates = new Set<string>();
  if (alertId) resourceCandidates.add(alertId);
  resourceCandidates.add(entryId);

  let auditLogChain: AuditLogRow[] = [];
  if (resourceCandidates.size > 0) {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        details: auditLogs.details,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, orgId),
          sql`${auditLogs.resourceId} IN (${sql.join(
            Array.from(resourceCandidates).map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
    auditLogChain = rows.map((r) => {
      const d = (r.details ?? null) as Record<string, unknown> | null;
      const actor =
        (d?.acknowledged_by as string | undefined) ??
        (d?.justified_by as string | undefined) ??
        (d?.verified_by as string | undefined) ??
        (r.userId ?? null);
      return {
        id: r.id,
        action: r.action,
        occurred_at: r.createdAt.toISOString(),
        actor,
        details: d,
      };
    });
  }

  // ── Related entries ────────────────────────────────────────────────────
  // Two sources:
  //   1. evidence_refs[type=related_entry_id] — explicit links the handler
  //      embedded (e.g., privileged-grant ack → underlying grant_access entry).
  //   2. Other entries in this org that share the same alert_id (covers
  //      siblings written by different handlers — e.g., a break-glass entry
  //      and a privileged-grant entry created in the same Azure session).
  const relatedEntryIds = new Set<string>();
  for (const ref of evidenceRefs) {
    if (ref.type === "related_entry_id" && typeof ref.value === "string") {
      relatedEntryIds.add(ref.value);
    }
  }

  let related: RelatedEntry[] = [];

  if (relatedEntryIds.size > 0) {
    const rows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryType: governanceRegisterEntries.entryType,
        status: governanceRegisterEntries.status,
        registerKey: governanceRegisters.registerKey,
        registerOrgId: governanceRegisters.organizationId,
      })
      .from(governanceRegisterEntries)
      .innerJoin(
        governanceRegisters,
        eq(governanceRegisterEntries.registerId, governanceRegisters.id),
      )
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          sql`${governanceRegisterEntries.id} IN (${sql.join(
            Array.from(relatedEntryIds).map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
    for (const r of rows) {
      related.push({
        register_key: r.registerKey,
        entry_id: r.id,
        entry_type: r.entryType,
        status: r.status,
        label: `Linked via evidence_refs[].related_entry_id`,
      });
    }
  }

  if (alertId) {
    const rows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryType: governanceRegisterEntries.entryType,
        status: governanceRegisterEntries.status,
        registerKey: governanceRegisters.registerKey,
      })
      .from(governanceRegisterEntries)
      .innerJoin(
        governanceRegisters,
        eq(governanceRegisterEntries.registerId, governanceRegisters.id),
      )
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          sql`${governanceRegisterEntries.entryData} ->> 'alert_id' = ${alertId}`,
        ),
      )
      .limit(20);
    for (const r of rows) {
      if (r.id === entryId) continue;
      // Skip duplicates from the related_entry_id pass.
      if (related.some((e) => e.entry_id === r.id)) continue;
      related.push({
        register_key: r.registerKey,
        entry_id: r.id,
        entry_type: r.entryType,
        status: r.status,
        label: `Linked via shared alert_id=${alertId}`,
      });
    }
  }

  // ── Manifest history ───────────────────────────────────────────────────
  // Every manifest that touched this entry. The primary one is the
  // entryData.manifest_id; ack-review handlers also append manifest_ids
  // to evidence_refs[] so we walk those too.
  const manifestIds = new Set<string>();
  if (manifestId) manifestIds.add(manifestId);
  for (const ref of evidenceRefs) {
    if (ref.type === "manifest_id" && typeof ref.value === "string") {
      manifestIds.add(ref.value);
    }
  }

  let manifestHistory: ManifestHistoryRow[] = [];
  if (manifestIds.size > 0) {
    const rows = await db
      .select({
        manifestId: issoExportManifests.manifestId,
        receivedAt: issoExportManifests.receivedAt,
        sectionsProcessed: issoExportManifests.sectionsProcessed,
        controlsTouched: issoExportManifests.controlsTouched,
      })
      .from(issoExportManifests)
      .where(
        and(
          eq(issoExportManifests.organizationId, orgId),
          sql`${issoExportManifests.manifestId} IN (${sql.join(
            Array.from(manifestIds).map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
      .orderBy(desc(issoExportManifests.receivedAt));
    manifestHistory = rows.map((r) => ({
      manifest_id: r.manifestId,
      received_at: r.receivedAt.toISOString(),
      sections_processed: Array.isArray(r.sectionsProcessed)
        ? (r.sectionsProcessed as string[])
        : [],
      controls_touched: Array.isArray(r.controlsTouched)
        ? (r.controlsTouched as string[])
        : [],
    }));
  }

  return NextResponse.json({
    entry_id: entryId,
    register_key: row.registerKey,
    entry_type: row.entryType,
    alert_id: alertId,
    manifest_id: manifestId,
    audit_log_chain: auditLogChain,
    related_entries: related,
    manifest_history: manifestHistory,
    evidence_refs: evidenceRefs,
  });
}
