import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  governanceRegisterEntries,
  governanceRegisters,
  governanceEntryEvents,
  users,
  auditLogs,
  issoExportManifests,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  getFieldLabel,
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
} from "@/data/cmmc/field-labels-and-summaries";
import { FinalizeButton } from "./FinalizeButton";
import { EntryAttachments } from "./EntryAttachments";
import { BreakGlassAckForm } from "./BreakGlassAckForm";
import { PrivilegedGrantJustifyForm } from "./PrivilegedGrantJustifyForm";
import { ChangeDriftJustifyForm } from "./ChangeDriftJustifyForm";
import { DefenderAlertAckForm } from "./DefenderAlertAckForm";
import { EvidenceRefList } from "@/components/governance/EvidenceRefList";
import { LifecycleStateBadge } from "@/components/governance/LifecycleStateBadge";

type PageProps = { params: Promise<{ entryId: string }> };

export default async function EvidenceEngineEntryDetailPage({ params }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { entryId } = await params;

  const [entry] = await db
    .select()
    .from(governanceRegisterEntries)
    .where(eq(governanceRegisterEntries.id, entryId));

  if (!entry) notFound();

  const [register] = await db
    .select()
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.id, entry.registerId),
        eq(governanceRegisters.organizationId, orgId)
      )
    );

  if (!register) notFound();

  const data = (entry.entryData ?? {}) as Record<string, unknown>;
  const registerKey = register.registerKey;
  const entryType = entry.entryType ?? "unknown";
  const template = getSummaryTemplate(registerKey, entryType);
  const summary = template
    ? renderSummary(template, data)
    : getFallbackSummary(entryType, data);

  const keys = Object.keys(data).sort();
  const isDraft = entry.status === "draft";
  const userRole = (session?.user as { role?: string })?.role;
  const canFinalize = userRole === "Admin";

  const timelineRows = await db
    .select({
      id: governanceEntryEvents.id,
      eventAt: governanceEntryEvents.eventAt,
      eventType: governanceEntryEvents.eventType,
      eventJson: governanceEntryEvents.eventJson,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(governanceEntryEvents)
    .leftJoin(users, eq(governanceEntryEvents.actorUserId, users.id))
    .where(
      and(
        eq(governanceEntryEvents.entryId, entryId),
        eq(governanceEntryEvents.orgId, orgId)
      )
    )
    .orderBy(desc(governanceEntryEvents.eventAt));

  function timelineSummary(eventType: string, eventJson: Record<string, unknown> | null): string {
    if (eventType === "created") return "Entry created";
    if (eventType === "updated") return (eventJson?.summary as string) ?? "Fields updated";
    if (eventType === "finalized") return (eventJson?.summary as string) ?? "Entry finalized";
    if (eventType === "attachment_added") {
      const name = eventJson?.originalFilename as string | undefined;
      return name ? `Attachment added: ${name}` : "Attachment added";
    }
    if (eventType === "voided") {
      const reason = eventJson?.voidReason as string | undefined;
      return reason ? `Voided: ${reason}` : "Entry voided";
    }
    return eventType;
  }

  // ── Phase 5: cross-reference graph ─────────────────────────────────────
  // Fetch related events for the auditor-defensibility chain. Values that
  // don't apply (no alert_id, no manifest_id) just return empty arrays.
  const alertId = (data.alert_id as string | undefined) ?? null;
  const primaryManifestId = (data.manifest_id as string | undefined) ?? null;
  const evidenceRefs = Array.isArray(data.evidence_refs)
    ? (data.evidence_refs as Array<Record<string, unknown>>)
    : [];

  // Audit-log chain — every audit event keyed by alert_id (preferred) or
  // entry id. Phase 1/2/3 ack chains use alert_id as resourceId, so when
  // present that's the natural pivot.
  const auditResourceCandidates = new Set<string>();
  if (alertId) auditResourceCandidates.add(alertId);
  auditResourceCandidates.add(entryId);
  const auditLogChain =
    auditResourceCandidates.size > 0
      ? await db
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
                Array.from(auditResourceCandidates).map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(50)
      : [];

  // Related entries — explicit links via evidence_refs[type=related_entry_id]
  // PLUS siblings sharing the same alert_id.
  const relatedEntryIds = new Set<string>();
  for (const ref of evidenceRefs) {
    if (
      typeof ref.type === "string" &&
      ref.type === "related_entry_id" &&
      typeof ref.value === "string"
    ) {
      relatedEntryIds.add(ref.value);
    }
  }
  type RelatedRow = {
    id: string;
    entryType: string | null;
    status: string;
    registerKey: string;
    label: string;
  };
  const relatedEntries: RelatedRow[] = [];
  if (relatedEntryIds.size > 0) {
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
          sql`${governanceRegisterEntries.id} IN (${sql.join(
            Array.from(relatedEntryIds).map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
    for (const r of rows) {
      relatedEntries.push({
        id: r.id,
        entryType: r.entryType,
        status: r.status,
        registerKey: r.registerKey,
        label: "Linked via evidence_refs[].related_entry_id",
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
      if (relatedEntries.some((e) => e.id === r.id)) continue;
      relatedEntries.push({
        id: r.id,
        entryType: r.entryType,
        status: r.status,
        registerKey: r.registerKey,
        label: `Linked via shared alert_id=${alertId}`,
      });
    }
  }

  // Manifest history — every manifest that touched this entry.
  const manifestIdSet = new Set<string>();
  if (primaryManifestId) manifestIdSet.add(primaryManifestId);
  for (const ref of evidenceRefs) {
    if (
      typeof ref.type === "string" &&
      ref.type === "manifest_id" &&
      typeof ref.value === "string"
    ) {
      manifestIdSet.add(ref.value);
    }
  }
  const manifestHistory =
    manifestIdSet.size > 0
      ? await db
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
                Array.from(manifestIdSet).map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          )
          .orderBy(desc(issoExportManifests.receivedAt))
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}`}
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← {register.name}
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          Entry detail
        </h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-gray-600)]">
          <span className="font-mono">{entryType}</span>
          <span>·</span>
          <span className="font-mono">{entry.status}</span>
          {typeof data.lifecycle_state === "string" && data.lifecycle_state && (
            <LifecycleStateBadge state={data.lifecycle_state} />
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Summary</h3>
        <p className="mt-2 text-[var(--color-gray-800)]">{summary}</p>
      </div>

      {entryType === "break_glass_acknowledgment" && isDraft && canFinalize && (
        <BreakGlassAckForm
          entryId={entryId}
          detection={{
            alert_id: data.alert_id as string | undefined,
            upn: data.upn as string | undefined,
            detected_at: data.detected_at as string | undefined,
            source: data.source as string | undefined,
            client_ip: (data.client_ip as string | null | undefined) ?? null,
            app_or_resource: (data.app_or_resource as string | null | undefined) ?? null,
            actions_observed: (data.actions_observed as string[] | null | undefined) ?? null,
          }}
        />
      )}

      {entryType === "privileged_grant_acknowledgment" && isDraft && canFinalize && (
        <PrivilegedGrantJustifyForm
          entryId={entryId}
          detection={{
            alert_id: data.alert_id as string | undefined,
            actor_user: (data.actor_user as string | undefined) ?? (data.subject_user as string | undefined),
            actor_user_id: (data.actor_user_id as string | null | undefined) ?? null,
            azure_role_name: (data.azure_role_name as string | null | undefined) ?? null,
            scope_arm: (data.scope_arm as string | null | undefined) ?? null,
            system: (data.system as string | null | undefined) ?? null,
            occurred_at: data.occurred_at as string | undefined,
            detected_at: data.detected_at as string | undefined,
            approver:
              (data.approver as string | null | undefined) ??
              (data.actor_display_name as string | null | undefined) ??
              null,
            related_grant_entry_id:
              (data.related_grant_entry_id as string | null | undefined) ?? null,
          }}
        />
      )}

      {entryType === "change_drift_acknowledgment" && isDraft && canFinalize && (
        <ChangeDriftJustifyForm
          entryId={entryId}
          detection={{
            alert_id: data.alert_id as string | undefined,
            actor_user: (data.actor_user as string | null | undefined) ?? null,
            path: (data.path as string | null | undefined) ?? null,
            change_type: (data.change_type as string | null | undefined) ?? null,
            event_type: (data.event_type as string | null | undefined) ?? null,
            host: (data.host as string | null | undefined) ?? null,
            system: (data.system as string | null | undefined) ?? null,
            occurred_at: data.occurred_at as string | undefined,
            detected_at: data.detected_at as string | undefined,
            process_image: (data.process_image as string | null | undefined) ?? null,
            sysmon_event_id:
              (data.sysmon_event_id as number | null | undefined) ?? null,
            related_change_log_entry_id:
              (data.related_change_log_entry_id as string | null | undefined) ?? null,
          }}
        />
      )}

      {entryType === "defender_alert_acknowledgment" && isDraft && canFinalize && (
        <DefenderAlertAckForm
          entryId={entryId}
          detection={{
            alert_id: data.alert_id as string | undefined,
            alert_title:
              (data.actor_alert_title as string | null | undefined) ?? null,
            severity: (data.severity as string | null | undefined) ?? null,
            category: (data.category as string | null | undefined) ?? null,
            event_type: (data.event_type as string | null | undefined) ?? null,
            system: (data.system as string | null | undefined) ?? null,
            actor_user: (data.actor_user as string | null | undefined) ?? null,
            affected_assets:
              (data.affected_assets as string[] | null | undefined) ?? null,
            mitre_techniques:
              (data.mitre_techniques as string[] | null | undefined) ?? null,
            graph_alert_url:
              (data.graph_alert_url as string | null | undefined) ?? null,
            occurred_at: data.occurred_at as string | undefined,
            detected_at: data.detected_at as string | undefined,
          }}
        />
      )}

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Fields</h3>
          {isDraft && canFinalize && (
            <FinalizeButton
              entryId={entryId}
              registerKey={registerKey}
              boundaryId={entry.boundaryId}
            />
          )}
        </div>
        <dl className="mt-4 space-y-3">
          {keys.map((key) => (
            <div key={key} className="flex gap-4 border-b border-[var(--color-border-muted)] pb-2">
              <dt className="w-48 shrink-0 text-sm font-medium text-[var(--color-gray-700)]">
                {getFieldLabel(key)}
              </dt>
              <dd className="flex-1 min-w-0 text-sm text-[var(--color-gray-900)]">
                <FieldValue value={data[key]} />
              </dd>
            </div>
          ))}
        </dl>
        {keys.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">No field data.</p>
        )}
      </div>

      <EntryAttachments entryId={entryId} />

      {/* Phase 5: Evidence references (§1.9) — every cross-reference the
          handler embedded so the auditor can navigate from this entry to
          source manifest, related entries, audit-log rows, tickets. */}
      <EvidenceRefList
        refs={evidenceRefs}
        primaryManifestId={primaryManifestId}
      />

      {/* Phase 5: Related events — audit-log chain + sibling register
          entries. Lets the auditor reconstruct the full ack/verification
          loop from this single page. */}
      {(auditLogChain.length > 0 ||
        relatedEntries.length > 0 ||
        manifestHistory.length > 0) && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Related events
          </h3>
          <p className="mt-1 text-xs text-[var(--color-gray-500)]">
            Cross-reference graph for this entry. Click through to navigate
            the full audit chain.
          </p>

          {auditLogChain.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                Audit-log chain ({auditLogChain.length})
              </h4>
              <ul className="mt-2 space-y-1.5">
                {auditLogChain.map((row) => {
                  const d =
                    (row.details ?? null) as Record<string, unknown> | null;
                  const actor =
                    (d?.acknowledged_by as string | undefined) ??
                    (d?.justified_by as string | undefined) ??
                    (d?.verified_by as string | undefined) ??
                    (row.userId ?? "system");
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-1.5 text-sm last:border-0"
                    >
                      <span className="font-mono text-[10px] text-[var(--color-gray-500)]">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                      <span className="font-mono text-xs text-[var(--color-gray-800)] break-all">
                        {row.action}
                      </span>
                      <span className="text-[11px] text-[var(--color-gray-600)]">
                        by {actor}
                      </span>
                      <Link
                        href={`/admin/audit-logs?id=${encodeURIComponent(row.id)}`}
                        className="ml-auto text-[11px] text-[var(--color-blue-accent)] hover:underline"
                      >
                        view →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {relatedEntries.length > 0 && (
            <div className="mt-5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                Related entries ({relatedEntries.length})
              </h4>
              <ul className="mt-2 space-y-1.5">
                {relatedEntries.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-1.5 text-sm last:border-0"
                  >
                    <span className="font-mono text-xs text-[var(--color-gray-800)]">
                      {r.entryType ?? "(unknown type)"}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-gray-500)]">
                      {r.registerKey}
                    </span>
                    <span className="text-[11px] text-[var(--color-gray-500)]">
                      {r.status}
                    </span>
                    <span className="text-[11px] text-[var(--color-gray-600)]">
                      {r.label}
                    </span>
                    <Link
                      href={`/dashboard/evidence-engine/entries/${r.id}`}
                      className="ml-auto text-[11px] text-[var(--color-blue-accent)] hover:underline"
                    >
                      open →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {manifestHistory.length > 0 && (
            <div className="mt-5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                Manifest history ({manifestHistory.length})
              </h4>
              <ul className="mt-2 space-y-1.5">
                {manifestHistory.map((m) => {
                  const sections = Array.isArray(m.sectionsProcessed)
                    ? (m.sectionsProcessed as string[])
                    : [];
                  return (
                    <li
                      key={m.manifestId}
                      className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-1.5 text-sm last:border-0"
                    >
                      <span className="font-mono text-[10px] text-[var(--color-gray-500)] break-all">
                        {m.manifestId.slice(0, 16)}…
                      </span>
                      <span className="text-[11px] text-[var(--color-gray-500)]">
                        ingested{" "}
                        {new Date(m.receivedAt).toLocaleString()}
                      </span>
                      <span className="text-[11px] text-[var(--color-gray-600)]">
                        sections: {sections.length > 0 ? sections.join(", ") : "—"}
                      </span>
                      <Link
                        href={`/dashboard/monitoring/manifests/${encodeURIComponent(m.manifestId)}`}
                        className="ml-auto text-[11px] text-[var(--color-blue-accent)] hover:underline"
                      >
                        open →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Timeline</h3>
        {timelineRows.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">No events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {timelineRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-2 text-sm last:border-0"
              >
                <span className="text-[var(--color-gray-500)]">
                  {row.eventAt ? new Date(row.eventAt).toLocaleString() : "—"}
                </span>
                <span className="font-medium text-[var(--color-gray-700)]">
                  {row.actorName ?? row.actorEmail ?? "System"}
                </span>
                <span className="text-[var(--color-gray-600)]">
                  {timelineSummary(row.eventType, row.eventJson as Record<string, unknown> | null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-[var(--color-gray-600)]">
        Created {new Date(entry.createdAt).toLocaleString()}
        {entry.finalizedAt && (
          <> · Finalized {new Date(entry.finalizedAt).toLocaleString()}</>
        )}
      </div>
    </div>
  );
}

/**
 * Render a single entryData field value. Handles the four shapes that
 * actually show up in the codex's register entries:
 *   - primitives (string/number/bool/null) -> plain text
 *   - empty string / null / undefined        -> em dash
 *   - array of primitives                    -> joined with commas
 *   - array of objects / nested object       -> collapsible pretty-printed JSON
 *
 * Without this, the page renders nested objects via String(value), which
 * yields the famously useless "[object Object]". For inventory_snapshot
 * entries (users / service_principals / devices / scope / totals / diff_
 * from_previous) every meaningful field is nested -- the old rendering
 * meant the page surfaced literally none of the snapshot data.
 */
function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-[var(--color-gray-400)]">—</span>;
  }
  // Primitives
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="break-words">{String(value)}</span>;
  }
  // Array of primitives -> comma-joined
  if (Array.isArray(value) && value.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))) {
    if (value.length === 0) {
      return <span className="text-[var(--color-gray-400)] italic">empty list</span>;
    }
    return <span className="break-words">{value.map((v) => String(v)).join(", ")}</span>;
  }
  // Array of objects -> count + collapsible JSON
  if (Array.isArray(value)) {
    return (
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--color-blue-accent)] hover:underline">
          {value.length} item{value.length === 1 ? "" : "s"} (click to expand)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-3 font-mono text-[11px] leading-relaxed text-[var(--color-gray-800)]">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    );
  }
  // Plain object -> compact key:value list, with deep nesting fall-through to JSON
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return <span className="text-[var(--color-gray-400)] italic">empty</span>;
    }
    // Shallow object with all-primitive values -> inline list
    const allPrimitive = keys.every((k) => {
      const v = obj[k];
      return v === null || ["string", "number", "boolean"].includes(typeof v);
    });
    if (allPrimitive) {
      return (
        <ul className="space-y-0.5">
          {keys.map((k) => (
            <li key={k} className="text-xs">
              <span className="font-medium text-[var(--color-gray-600)]">{k}:</span>{" "}
              <span className="text-[var(--color-gray-900)]">
                {obj[k] === null || obj[k] === "" ? "—" : String(obj[k])}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    // Otherwise fall back to JSON (collapsed)
    return (
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--color-blue-accent)] hover:underline">
          object ({keys.length} field{keys.length === 1 ? "" : "s"} — click to expand)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-3 font-mono text-[11px] leading-relaxed text-[var(--color-gray-800)]">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    );
  }
  return <span className="break-words">{String(value)}</span>;
}
