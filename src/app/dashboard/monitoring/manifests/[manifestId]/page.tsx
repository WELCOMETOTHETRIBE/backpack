import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  issoExportManifests,
  governanceRegisterEntries,
  governanceRegisters,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DataUnavailable } from "@/components/ui/DataUnavailable";

/**
 * Manifest detail page — Phase 5 of Register-Automation v1.1.
 *
 * Shows everything about a single signed weekly export the codex
 * ingested:
 *   - manifest_id, version, vault_id, review window, ingest receipt
 *   - sections_processed[] + controls_touched[]
 *   - all register entries written or touched by this manifest
 *     (queried via entryData->>'manifest_id' OR entries with this
 *     manifest_id appearing in evidence_refs[])
 *   - the codex's audit-log row for the ingest itself
 *   - any per-section warnings the dispatcher recorded
 *
 * The route is reached from:
 *   - the Monitoring tab "Recent ISSO weekly exports" card (each row
 *     click-throughs here)
 *   - any entry detail page's "Manifest history" cross-reference list
 *   - the EvidenceRefList component when a ref has type=manifest_id
 */

type PageProps = { params: Promise<{ manifestId: string }> };

export default async function ManifestDetailPage({ params }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { manifestId: rawManifestId } = await params;
  const manifestId = decodeURIComponent(rawManifestId);

  let manifest: typeof issoExportManifests.$inferSelect | undefined;
  try {
    [manifest] = await db
      .select()
      .from(issoExportManifests)
      .where(
        and(
          eq(issoExportManifests.manifestId, manifestId),
          eq(issoExportManifests.organizationId, orgId),
        ),
      )
      .limit(1);
  } catch (err) {
    console.error("Manifest detail primary fetch failed:", err);
    return (
      <DataUnavailable
        resource="manifest"
        backTo="/dashboard/monitoring"
        backLabel="Back to Monitoring"
      />
    );
  }

  if (!manifest) notFound();

  // Entries written by THIS manifest (entry_data->>'manifest_id' matches),
  // joined with the register so we can render labels.
  const directEntries = await db
    .select({
      id: governanceRegisterEntries.id,
      entryType: governanceRegisterEntries.entryType,
      status: governanceRegisterEntries.status,
      createdAt: governanceRegisterEntries.createdAt,
      finalizedAt: governanceRegisterEntries.finalizedAt,
      registerKey: governanceRegisters.registerKey,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisterEntries.registerId, governanceRegisters.id),
    )
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisterEntries.entryData} ->> 'manifest_id' = ${manifestId}`,
      ),
    )
    .limit(200);

  // Entries TOUCHED by this manifest (manifest_id appears in
  // evidence_refs[]) — covers ack-review applications where the manifest
  // didn't write the entry but did update its lifecycle.
  const touchedEntries = await db
    .select({
      id: governanceRegisterEntries.id,
      entryType: governanceRegisterEntries.entryType,
      status: governanceRegisterEntries.status,
      createdAt: governanceRegisterEntries.createdAt,
      finalizedAt: governanceRegisterEntries.finalizedAt,
      registerKey: governanceRegisters.registerKey,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisterEntries.registerId, governanceRegisters.id),
    )
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            COALESCE(${governanceRegisterEntries.entryData} -> 'evidence_refs', '[]'::jsonb)
          ) AS ref
          WHERE ref ->> 'type' = 'manifest_id'
            AND ref ->> 'value' = ${manifestId}
        )`,
      ),
    )
    .limit(200);

  // Dedupe direct + touched (direct wins).
  const directIds = new Set(directEntries.map((e) => e.id));
  const allEntries = [
    ...directEntries.map((e) => ({ ...e, source: "direct" as const })),
    ...touchedEntries
      .filter((e) => !directIds.has(e.id))
      .map((e) => ({ ...e, source: "touched" as const })),
  ];

  // Audit-log entry for the ingest itself.
  const ingestAuditRows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      details: auditLogs.details,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, orgId),
        eq(auditLogs.resourceId, manifestId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);

  const sectionsProcessed = Array.isArray(manifest.sectionsProcessed)
    ? (manifest.sectionsProcessed as string[])
    : [];
  const controlsTouched = Array.isArray(manifest.controlsTouched)
    ? (manifest.controlsTouched as string[])
    : [];
  const responsePayload = (manifest.responsePayload ?? {}) as Record<
    string,
    unknown
  >;
  const warnings = Array.isArray(responsePayload.warnings)
    ? (responsePayload.warnings as string[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Monitoring", href: "/dashboard/monitoring" },
            { label: "ISSO weekly export" },
          ]}
        />
        <h2 className="text-xl font-semibold text-[var(--color-navy-primary)]">
          ISSO weekly export
        </h2>
        <p className="mt-0.5 font-mono text-xs text-[var(--color-gray-600)] break-all">
          {manifestId}
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Manifest receipt
        </h3>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          <Field label="Version" value={`v${manifest.manifestVersion}`} />
          <Field label="Vault ID" value={manifest.vaultId ?? "—"} />
          <Field
            label="Review period start"
            value={
              manifest.reviewPeriodStart
                ? new Date(manifest.reviewPeriodStart).toLocaleString()
                : "—"
            }
          />
          <Field
            label="Review period end"
            value={new Date(manifest.reviewPeriodEnd).toLocaleString()}
          />
          <Field
            label="Received at"
            value={new Date(manifest.receivedAt).toLocaleString()}
          />
          <Field
            label="Sections processed"
            value={
              sectionsProcessed.length > 0
                ? sectionsProcessed.join(", ")
                : "(none)"
            }
          />
          <Field
            label="Controls touched"
            value={
              controlsTouched.length > 0
                ? `${controlsTouched.length}: ${controlsTouched.join(", ")}`
                : "(none)"
            }
          />
        </dl>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Register entries written or touched
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)]">
            {allEntries.length} total · {directEntries.length} created ·{" "}
            {allEntries.length - directEntries.length} updated by ack-review
          </span>
        </div>
        {allEntries.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-gray-500)]">
            No register entries reference this manifest yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-border-muted)]">
            {allEntries.map((e) => {
              const data = (e.entryData ?? {}) as Record<string, unknown>;
              const lifecycleState =
                (data.lifecycle_state as string | undefined) ?? null;
              const summary = pickEntrySummary(e.entryType, data);
              return (
                <li key={e.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs text-[var(--color-gray-800)]">
                      {e.entryType ?? "(unknown type)"}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-[var(--color-gray-500)]">
                      {e.registerKey}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                        e.status === "final"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {e.status}
                    </span>
                    {lifecycleState && (
                      <span className="text-[10px] uppercase tracking-wide rounded bg-[var(--color-gray-100)] px-1.5 py-0.5 text-[var(--color-gray-700)]">
                        {lifecycleState}
                      </span>
                    )}
                    <span
                      className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                        e.source === "direct"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-purple-50 text-purple-700"
                      }`}
                    >
                      {e.source === "direct" ? "created" : "ack-review applied"}
                    </span>
                    <Link
                      href={`/dashboard/evidence-engine/entries/${e.id}`}
                      className="ml-auto text-[11px] text-[var(--color-blue-accent)] hover:underline"
                    >
                      open →
                    </Link>
                  </div>
                  {summary && (
                    <p className="mt-0.5 text-xs text-[var(--color-gray-600)] break-words">
                      {summary}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-900">
            Dispatcher warnings ({warnings.length})
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-amber-800">
            {warnings.map((w, i) => (
              <li key={i} className="font-mono text-xs break-words">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ingestAuditRows.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Audit-log rows for this manifest
          </h3>
          <ul className="mt-3 space-y-1.5">
            {ingestAuditRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-1.5 text-sm last:border-0"
              >
                <span className="font-mono text-[10px] text-[var(--color-gray-500)]">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
                <span className="font-mono text-xs text-[var(--color-gray-800)] break-all">
                  {r.action}
                </span>
                <Link
                  href={`/admin/audit-logs?id=${encodeURIComponent(r.id)}`}
                  className="ml-auto text-[11px] text-[var(--color-blue-accent)] hover:underline"
                >
                  view →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-[var(--color-border-muted)] pb-2">
      <dt className="w-44 shrink-0 text-xs font-medium text-[var(--color-gray-700)]">
        {label}
      </dt>
      <dd className="flex-1 min-w-0 text-sm text-[var(--color-gray-900)] break-words">
        {value}
      </dd>
    </div>
  );
}

/**
 * Pick a one-line summary for a register entry from its entryData. Each
 * entry type has different "interesting" fields; this is a best-effort
 * pick that surfaces the most-distinctive field for each known type.
 */
function pickEntrySummary(
  entryType: string | null,
  data: Record<string, unknown>,
): string | null {
  if (!entryType) return null;
  const get = (k: string) =>
    typeof data[k] === "string" ? (data[k] as string) : null;

  if (entryType === "break_glass_acknowledgment") {
    return `${get("upn") ?? "(unknown)"} · alert ${get("alert_id") ?? "(none)"}`;
  }
  if (entryType === "privileged_grant_acknowledgment") {
    return `${get("actor_user") ?? "(unknown)"} → ${get("azure_role_name") ?? "(role)"} on ${get("scope_arm") ?? "(scope)"}`;
  }
  if (entryType === "change_drift_acknowledgment") {
    return `${get("change_type") ?? "(unknown)"} on ${get("path") ?? "(path)"} (${get("host") ?? "host"})`;
  }
  if (entryType === "defender_alert_acknowledgment") {
    return `${get("severity") ?? "?"} · ${get("actor_alert_title") ?? "(unknown)"} on ${get("system") ?? "(system)"}`;
  }
  if (entryType === "weekly_review") {
    return `Review period ending ${get("review_period_end") ?? "(?)"} — ${get("review_result") ?? "?"}`;
  }
  if (entryType === "incident_opened") {
    return `${get("severity") ?? "?"} · ${get("summary") ?? "(no summary)"}`;
  }
  if (entryType === "verification_observed") {
    return `${get("vuln_id") ?? "(?)"} on ${get("asset") ?? "(?)"} — ${get("status_observed") ?? "?"}`;
  }
  if (entryType === "weekly_review_finding") {
    return `${get("finding_type") ?? "?"} for ${get("subject_user") ?? "(?)"} (${get("severity") ?? "?"})`;
  }
  if (entryType === "stale_document_flag") {
    return `${get("doc_code") ?? "(?)"} — ${get("recommended_action") ?? "?"}`;
  }
  if (entryType === "review_observation") {
    return `${get("control_id") ?? "(?)"} · ${get("summary") ?? "(no summary)"}`;
  }
  return get("summary") ?? null;
}
