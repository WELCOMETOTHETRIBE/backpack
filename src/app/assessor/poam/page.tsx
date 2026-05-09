import { requireAssessor } from "@/lib/role-gate";
import { db } from "@/db";
import {
  poamEntries,
  poamEntryMilestones,
  controlRecords,
  controls,
  roles,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default async function AssessorPoamPage() {
  const { orgId } = await requireAssessor();

  // ── Fetch all entries ──
  const entries = await db
    .select({
      id: poamEntries.id,
      status: poamEntries.status,
      weaknessDescription: poamEntries.weaknessDescription,
      remediationPlan: poamEntries.remediationPlan,
      scheduledCompletionDate: poamEntries.scheduledCompletionDate,
      closedAt: poamEntries.closedAt,
      closeoutEvidence: poamEntries.closeoutEvidence,
      createdAt: poamEntries.createdAt,
      controlId: controlRecords.controlId,
      controlTitle: controls.title,
      responsibleRole: roles.name,
    })
    .from(poamEntries)
    .leftJoin(controlRecords, eq(poamEntries.controlRecordId, controlRecords.id))
    .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .leftJoin(roles, eq(poamEntries.responsibleRoleId, roles.id))
    .where(eq(poamEntries.organizationId, orgId));

  // ── Fetch milestones for all entries in one query ──
  const entryIds = entries.map((e) => e.id);
  const milestones =
    entryIds.length > 0
      ? await db
          .select({
            poamEntryId: poamEntryMilestones.poamEntryId,
            id: poamEntryMilestones.id,
            title: poamEntryMilestones.title,
            dueDate: poamEntryMilestones.dueDate,
            completedAt: poamEntryMilestones.completedAt,
            orderIndex: poamEntryMilestones.orderIndex,
          })
          .from(poamEntryMilestones)
          .where(inArray(poamEntryMilestones.poamEntryId, entryIds))
      : [];

  const milestonesByEntry = new Map<string, typeof milestones>();
  for (const m of milestones) {
    const list = milestonesByEntry.get(m.poamEntryId) ?? [];
    list.push(m);
    milestonesByEntry.set(m.poamEntryId, list);
  }

  // Phase A0 (migration 0068) widened poam_entry_status with 'draft' and
  // 'active' for the auto-POA&M-on-NOT-MET flow. From an assessor's POV
  // anything not closed is an outstanding item — the canonical
  // "outstanding → POA&M" rule.
  const openEntries = entries.filter((e) => e.status !== "closed");
  const closedEntries = entries.filter((e) => e.status === "closed");

  const avgDaysOpen =
    openEntries.length > 0
      ? Math.round(
          openEntries.reduce(
            (sum, e) =>
              sum + Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86_400_000),
            0
          ) / openEntries.length
        )
      : 0;

  const withMilestonesCount = openEntries.filter(
    (e) => (milestonesByEntry.get(e.id)?.length ?? 0) > 0
  ).length;
  const missingMilestones = openEntries.length - withMilestonesCount;

  const cardClass = "rounded-xl border border-[var(--color-border)] bg-white shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">
            Plan of Action &amp; Milestones
          </h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Read-only view of all POA&amp;M items tracking open weaknesses and remediation milestones.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Open Items
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                openEntries.length > 0 ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {openEntries.length}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Closed Items
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-navy-primary)]">
              {closedEntries.length}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Missing Milestones
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                missingMilestones > 0 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {missingMilestones}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Avg Days Open
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                avgDaysOpen > 90
                  ? "text-red-600"
                  : avgDaysOpen > 30
                    ? "text-amber-600"
                    : "text-[var(--color-navy-primary)]"
              }`}
            >
              {avgDaysOpen}
            </p>
          </div>
        </div>

        {/* Open items */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-gray-700)]">
            <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />
            Open Items ({openEntries.length})
          </h2>

          {openEntries.length === 0 ? (
            <div className={`${cardClass} p-8 text-center`}>
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm text-[var(--color-gray-500)]">No open POA&amp;M items.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {openEntries.map((entry) => {
                const ms = milestonesByEntry.get(entry.id) ?? [];
                const completedMs = ms.filter((m) => m.completedAt).length;
                const daysOpen = Math.floor(
                  (Date.now() - new Date(entry.createdAt).getTime()) / 86_400_000
                );
                const isOverdue =
                  entry.scheduledCompletionDate
                    ? new Date(entry.scheduledCompletionDate) < new Date()
                    : false;

                return (
                  <div key={entry.id} className={`${cardClass} overflow-hidden`}>
                    <div className="px-5 py-4">
                      {/* Header row */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {entry.controlId && (
                              <Link
                                href={`/assessor/controls/${entry.controlId}`}
                                className="font-mono text-xs font-semibold text-[var(--color-navy-primary)] hover:underline"
                              >
                                {entry.controlId}
                              </Link>
                            )}
                            {entry.controlTitle && (
                              <span className="truncate text-xs text-[var(--color-gray-500)]">
                                {entry.controlTitle}
                              </span>
                            )}
                            {entry.responsibleRole && (
                              <span className="rounded bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-600)]">
                                {entry.responsibleRole}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-[var(--color-gray-700)]">
                            {entry.weaknessDescription ?? "No weakness description."}
                          </p>
                          {entry.remediationPlan && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-[var(--color-gray-500)]">
                              <span className="font-medium text-[var(--color-gray-600)]">Plan: </span>
                              {entry.remediationPlan}
                            </p>
                          )}
                        </div>

                        {/* Right column: dates */}
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`text-xs font-medium ${
                              daysOpen > 90
                                ? "text-red-600"
                                : daysOpen > 30
                                  ? "text-amber-600"
                                  : "text-[var(--color-gray-500)]"
                            }`}
                          >
                            {daysOpen}d open
                          </span>
                          {entry.scheduledCompletionDate && (
                            <span
                              className={`text-xs font-medium ${
                                isOverdue ? "text-red-600" : "text-[var(--color-gray-600)]"
                              }`}
                            >
                              Due: {new Date(entry.scheduledCompletionDate).toLocaleDateString()}
                              {isOverdue && " (overdue)"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Milestones */}
                      {ms.length > 0 ? (
                        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">
                            Milestones ({completedMs}/{ms.length})
                          </p>
                          <div className="space-y-1.5">
                            {ms.map((m) => (
                              <div key={m.id} className="flex items-center gap-2 text-xs">
                                <div
                                  className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                                    m.completedAt
                                      ? "border-emerald-500 bg-emerald-500"
                                      : "border-[var(--color-gray-300)] bg-white"
                                  }`}
                                />
                                <span
                                  className={
                                    m.completedAt
                                      ? "text-[var(--color-gray-400)] line-through"
                                      : "text-[var(--color-gray-700)]"
                                  }
                                >
                                  {m.title}
                                </span>
                                {m.dueDate && (
                                  <span className="ml-auto text-[var(--color-gray-400)]">
                                    {new Date(m.dueDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          No milestones defined — add milestones to meet assessment readiness criteria.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Closed items */}
        {closedEntries.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-gray-700)]">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
              Closed Items ({closedEntries.length})
            </h2>
            <div className="space-y-2">
              {closedEntries.map((entry) => (
                <div key={entry.id} className={`${cardClass} px-5 py-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.controlId && (
                        <Link
                          href={`/assessor/controls/${entry.controlId}`}
                          className="font-mono text-xs font-semibold text-[var(--color-navy-primary)] hover:underline"
                        >
                          {entry.controlId}
                        </Link>
                      )}
                      <span className="text-xs text-[var(--color-gray-600)]">
                        {entry.weaknessDescription?.slice(0, 100) ?? "Weakness resolved"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        Closed
                      </span>
                      {entry.closedAt && (
                        <span className="text-xs text-[var(--color-gray-400)]">
                          {new Date(entry.closedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {entry.closeoutEvidence && (
                    <p className="mt-1 text-xs text-[var(--color-gray-500)]">
                      <span className="font-medium">Closeout: </span>
                      {entry.closeoutEvidence}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {entries.length === 0 && (
          <div className={`${cardClass} p-10 text-center`}>
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
            <p className="text-sm font-medium text-[var(--color-gray-700)]">No POA&amp;M entries.</p>
            <p className="mt-1 text-xs text-[var(--color-gray-500)]">
              POA&amp;M items are created by the compliance team when a control gap is identified.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
