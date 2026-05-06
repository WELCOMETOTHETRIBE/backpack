import Link from "next/link";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { getLatestAdjudicationsForOrg } from "@/lib/evidence-engine/adjudication/scorer";
import { AdjudicationStatusBadge } from "@/components/governance/AdjudicationStatusBadge";
import { requireAuditorRole } from "@/lib/auditor-role-gate";

/**
 * /auditor — read-only assessment view index.
 *
 * Phase 10 of the Control Adjudication Ecosystem roadmap. Shows every
 * CMMC control with its latest adjudication status + click-through to a
 * per-control read-only auditor view.
 *
 * This page is the C3PAO's entry point during a formal assessment. The
 * view is intentionally chrome-stripped (no admin actions, no edit
 * affordances on the per-control pages) so the auditor can focus on
 * adjudication.
 *
 * Auth: any authenticated session in the org (today). Phase 10 follow-up
 * adds an Auditor role + IP allowlist gating; for now the page is
 * available to admins/compliance (the C3PAO is given a temporary account
 * in those roles by convention) — this preserves the existing auth
 * boundary while the read-only route family is being built out.
 */

export default async function AuditorIndexPage() {
  const { orgId } = await requireAuditorRole();

  const logic = getControlAssessmentLogic();
  const adjudications = await getLatestAdjudicationsForOrg(orgId);

  const openAssessments = await db
    .select()
    .from(assessments)
    .where(
      and(eq(assessments.organizationId, orgId), eq(assessments.status, "open")),
    )
    .orderBy(desc(assessments.openedAt))
    .limit(5);

  const counts = {
    satisfies: 0,
    partial: 0,
    at_risk: 0,
    gap: 0,
    no_data: 0,
  };
  for (const c of logic.controls) {
    const status = adjudications.get(c.control_id)?.status ?? null;
    if (status === "satisfies") counts.satisfies++;
    else if (status === "partial") counts.partial++;
    else if (status === "at_risk") counts.at_risk++;
    else if (status === "gap") counts.gap++;
    else counts.no_data++;
  }

  // Sort controls by family + numeric.
  const rows = [...logic.controls].sort((a, b) => {
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    return compareControlIds(a.control_id, b.control_id);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <header className="border-b border-[var(--color-border)] pb-4">
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
          C3PAO assessment view (read-only)
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold text-[var(--color-navy-primary)]">
          Control Adjudication Index
        </h1>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Per-control verdict derived from observed register entries.
          Click any control to walk the evidence: implementation
          statement, requirement breakdown, contributing entries,
          related events. Phase 10 of the Control Adjudication Ecosystem
          roadmap.
        </p>
      </header>

      {openAssessments.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/40 p-4 text-sm">
          <p className="font-medium text-amber-900">
            Open assessment{openAssessments.length === 1 ? "" : "s"}:
          </p>
          <ul className="mt-1 space-y-0.5">
            {openAssessments.map((a) => (
              <li key={a.id} className="text-xs text-amber-800">
                <span className="font-medium">{a.title}</span> — opened{" "}
                {new Date(a.openedAt).toLocaleString()}
                {a.assessorName && <> · assessor {a.assessorName}</>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-amber-700">
            OIS narratives for any control touched by an open assessment
            are frozen until close-out.
          </p>
        </div>
      )}

      {/* Status summary */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Status across {logic.controls.length} controls
        </h2>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          <SummaryCell label="Satisfies" count={counts.satisfies} tone="emerald" />
          <SummaryCell label="At risk" count={counts.at_risk} tone="blue" />
          <SummaryCell label="Partial" count={counts.partial} tone="amber" />
          <SummaryCell label="Gap" count={counts.gap} tone="red" />
          <SummaryCell label="No data" count={counts.no_data} tone="gray" />
        </div>
      </div>

      {/* Per-control table */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <ul className="divide-y divide-[var(--color-border-muted)]">
          {rows.map((control) => {
            const snap = adjudications.get(control.control_id);
            return (
              <li
                key={control.control_id}
                className="flex flex-wrap items-center gap-3 p-3 text-sm hover:bg-[var(--color-gray-50)]/60"
              >
                <span className="w-16 shrink-0 font-mono text-xs text-[var(--color-gray-700)]">
                  {control.control_id}
                </span>
                <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
                  {control.family}
                </span>
                <div className="min-w-0 flex-1">
                  {snap ? (
                    <AdjudicationStatusBadge
                      status={snap.status}
                      confidence={snap.confidence}
                    />
                  ) : (
                    <span className="text-[10px] text-[var(--color-gray-500)]">
                      no snapshot yet
                    </span>
                  )}
                </div>
                <Link
                  href={`/auditor/${encodeURIComponent(control.control_id)}`}
                  className="shrink-0 text-[11px] font-medium text-[var(--color-blue-accent)] hover:underline"
                >
                  open →
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "blue" | "red" | "gray";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40 text-emerald-900"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50/40 text-amber-900"
      : tone === "blue"
      ? "border-blue-200 bg-blue-50/40 text-blue-900"
      : tone === "red"
      ? "border-red-200 bg-red-50/40 text-red-900"
      : "border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/40 text-[var(--color-gray-700)]";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold">{count}</p>
    </div>
  );
}

function compareControlIds(a: string, b: string): number {
  const numericA = a.split(".").map((n) => parseInt(n, 10));
  const numericB = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(numericA.length, numericB.length); i++) {
    const av = numericA[i] ?? 0;
    const bv = numericB[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}
