import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  auditLogs,
  users,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import {
  getAuditActionLabel,
  getAuditActionTone,
} from "@/lib/audit-log-labels";

/**
 * /admin/audit-logs — central audit-log browse page.
 *
 * Phase 5 (Register-Automation v1.1) added click-throughs from entry detail
 * pages and the EvidenceRefList component to /admin/audit-logs?id=…; this
 * page is the resolver for those links plus a general filterable feed of
 * audit_logs rows.
 *
 * Filters (all optional, query-string driven):
 *   ?id=<uuid>          → highlight a single row (and load it even if
 *                         it falls outside the default time window)
 *   ?action=<prefix>    → action prefix filter (e.g. enclavewatch.defender_alert)
 *   ?resourceType=<v>   → exact resource_type filter
 *   ?resourceId=<v>     → exact resource_id filter (alert_id, manifest_id, etc.)
 *   ?days=<n>           → look-back window (default 14)
 *
 * Auth: session, any authenticated user in the org. Resource-id cross-links
 * resolve to register-entry detail pages via the entry's id (when the audit
 * row's resource_type is "*_entry" or its details.entry_id is set).
 */

const DEFAULT_LOOKBACK_DAYS = 14;
const ROW_LIMIT = 200;

type PageProps = {
  searchParams: Promise<{
    id?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    days?: string;
  }>;
};

export default async function AuditLogsPage({ searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const params = await searchParams;
  const highlightId = (params.id ?? "").trim() || null;
  const actionPrefix = (params.action ?? "").trim();
  const resourceType = (params.resourceType ?? "").trim();
  const resourceId = (params.resourceId ?? "").trim();
  const daysRaw = parseInt(params.days ?? "", 10);
  const lookbackDays =
    Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365
      ? daysRaw
      : DEFAULT_LOOKBACK_DAYS;

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const filters = [eq(auditLogs.organizationId, orgId), gte(auditLogs.createdAt, since)];
  if (actionPrefix) {
    filters.push(sql`${auditLogs.action} LIKE ${actionPrefix + "%"}`);
  }
  if (resourceType) filters.push(eq(auditLogs.resourceType, resourceType));
  if (resourceId) filters.push(eq(auditLogs.resourceId, resourceId));

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      details: auditLogs.details,
      ip: auditLogs.ip,
      createdAt: auditLogs.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(...filters))
    .orderBy(desc(auditLogs.createdAt))
    .limit(ROW_LIMIT);

  // If ?id is set and the row isn't already in the page, fetch it explicitly
  // and prepend so cross-references always land on a visible row.
  let pinnedRow: (typeof rows)[number] | null = null;
  if (highlightId && !rows.find((r) => r.id === highlightId)) {
    const [hit] = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        userEmail: users.email,
        userName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.id, highlightId)))
      .limit(1);
    if (hit) pinnedRow = hit;
  }

  // Resolve a navigable destination per row. The most common cross-ref:
  // an entry id is in details.entry_id (set by the four ack endpoints). When
  // present, link directly to the entry detail page. For manifest_id resource
  // types, link to the manifest detail page.
  function resolveTargetHref(row: (typeof rows)[number]): string | null {
    const d = (row.details ?? null) as Record<string, unknown> | null;
    const entryId = typeof d?.entry_id === "string" ? d.entry_id : null;
    if (entryId) return `/dashboard/evidence-engine/entries/${entryId}`;
    if (row.resourceType === "isso_export_manifest" && row.resourceId) {
      return `/dashboard/monitoring/manifests/${encodeURIComponent(row.resourceId)}`;
    }
    return null;
  }

  // Bonus: resolve register-key for any entry_id we DO surface (so the row
  // shows the register context). Best-effort, single batch query.
  const allEntryIds = [
    ...rows
      .map((r) => {
        const d = (r.details ?? null) as Record<string, unknown> | null;
        return typeof d?.entry_id === "string" ? d.entry_id : null;
      })
      .filter((x): x is string => !!x),
  ];
  if (pinnedRow) {
    const d = (pinnedRow.details ?? null) as Record<string, unknown> | null;
    if (typeof d?.entry_id === "string") allEntryIds.push(d.entry_id);
  }
  const entryIdSet = Array.from(new Set(allEntryIds));
  const entryRegisterMap = new Map<string, { registerKey: string; entryType: string | null }>();
  if (entryIdSet.length > 0) {
    const entryRows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryType: governanceRegisterEntries.entryType,
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
            entryIdSet.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );
    for (const e of entryRows) {
      entryRegisterMap.set(e.id, { registerKey: e.registerKey, entryType: e.entryType });
    }
  }

  const renderedRows = pinnedRow ? [pinnedRow, ...rows.filter((r) => r.id !== pinnedRow!.id)] : rows;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          Audit logs
        </h1>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Central feed of every audit-relevant action across the codex —
          break-glass detections, privileged-grant justifications, configuration-drift
          observations, Defender alert acknowledgments, ISSO weekly export ingests,
          and admin/codex session events. Phase 5 cross-references from entry
          detail pages and EvidenceRefList resolve here.
        </p>
      </div>

      {/* Filters / context bar */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <Field
            label="Action prefix"
            name="action"
            defaultValue={actionPrefix}
            placeholder="enclavewatch.defender_alert"
          />
          <Field
            label="Resource type"
            name="resourceType"
            defaultValue={resourceType}
            placeholder="defender_alert / isso_export_manifest / …"
          />
          <Field
            label="Resource ID"
            name="resourceId"
            defaultValue={resourceId}
            placeholder="alert_id, manifest_id, etc."
          />
          <Field
            label="Look-back (days)"
            name="days"
            defaultValue={String(lookbackDays)}
            placeholder="14"
            type="number"
            min="1"
            max="365"
          />
          {highlightId && <input type="hidden" name="id" value={highlightId} />}
          <button
            type="submit"
            className="rounded-md bg-[var(--color-navy-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-navy-deep)]"
          >
            Filter
          </button>
          {(actionPrefix || resourceType || resourceId || lookbackDays !== DEFAULT_LOOKBACK_DAYS) && (
            <Link
              href="/admin/audit-logs"
              className="text-xs text-[var(--color-blue-accent)] hover:underline"
            >
              clear
            </Link>
          )}
        </form>
        <p className="mt-2 text-[11px] text-[var(--color-gray-500)]">
          Showing the most recent {Math.min(ROW_LIMIT, renderedRows.length)} of {renderedRows.length}
          {" "}row{renderedRows.length === 1 ? "" : "s"} in the last {lookbackDays}d.
          {highlightId && (
            <> Highlighted row id <code className="font-mono">{highlightId.slice(0, 8)}…</code>.</>
          )}
        </p>
      </div>

      {/* Rows */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        {renderedRows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-gray-500)]">
            No audit-log rows match these filters in the last {lookbackDays} days.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-muted)]">
            {renderedRows.map((row) => {
              const isHighlight = row.id === highlightId;
              const tone = getAuditActionTone(row.action);
              const targetHref = resolveTargetHref(row);
              const d = (row.details ?? null) as Record<string, unknown> | null;
              const entryIdInDetails =
                typeof d?.entry_id === "string" ? d.entry_id : null;
              const entryCtx = entryIdInDetails
                ? entryRegisterMap.get(entryIdInDetails)
                : null;
              return (
                <li
                  key={row.id}
                  id={row.id}
                  className={`p-4 ${
                    isHighlight ? "bg-amber-50 ring-1 ring-amber-200" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <ToneDot tone={tone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-[var(--color-navy-primary)]">
                          {getAuditActionLabel(row.action)}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--color-gray-500)]">
                          {row.action}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                        {new Date(row.createdAt).toLocaleString()}{" "}
                        · by {row.userName ?? row.userEmail ?? "system"}
                        {" · "}resource{" "}
                        <span className="font-mono">{row.resourceType}</span>
                        {row.resourceId && (
                          <>
                            {" "}id{" "}
                            <span className="font-mono break-all">{row.resourceId}</span>
                          </>
                        )}
                        {entryCtx && (
                          <>
                            {" · "}entry{" "}
                            <span className="font-mono">{entryCtx.entryType}</span>{" "}
                            on{" "}
                            <span className="font-mono">{entryCtx.registerKey}</span>
                          </>
                        )}
                      </p>
                      {d && Object.keys(d).length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] text-[var(--color-blue-accent)] hover:underline">
                            details ({Object.keys(d).length} field{Object.keys(d).length === 1 ? "" : "s"})
                          </summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-2 font-mono text-[10px] text-[var(--color-gray-800)]">
                            {JSON.stringify(d, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    {targetHref && (
                      <Link
                        href={targetHref}
                        className="shrink-0 text-[11px] font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        open →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block text-[11px] text-[var(--color-gray-700)]">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        className="mt-0.5 block w-56 rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
      />
    </label>
  );
}

function ToneDot({ tone }: { tone: "neutral" | "amber" | "blue" | "green" | "red" }) {
  const cls =
    tone === "amber"
      ? "bg-amber-400"
      : tone === "blue"
      ? "bg-blue-500"
      : tone === "green"
      ? "bg-emerald-500"
      : tone === "red"
      ? "bg-red-500"
      : "bg-gray-300";
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}
