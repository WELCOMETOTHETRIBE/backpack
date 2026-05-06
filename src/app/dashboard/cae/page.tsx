import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { getLatestAdjudicationsForOrg } from "@/lib/evidence-engine/adjudication/scorer";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";

/**
 * /dashboard/cae — Control adjudication overview.
 *
 * Phase 7 of the Control Adjudication Ecosystem roadmap. Shows every CMMC
 * control with its latest adjudication status (satisfies / partial / gap /
 * at_risk), confidence bar, and a click-through to the per-control detail
 * page (Phase 6 OIS narrative + Phase 7 requirement breakdown).
 *
 * Sorted by family + control_id. Filters by family + status.
 */

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "satisfies", label: "Satisfies" },
  { key: "partial", label: "Partial" },
  { key: "at_risk", label: "At risk" },
  { key: "gap", label: "Gap" },
] as const;

type PageProps = {
  searchParams: Promise<{
    family?: string;
    status?: string;
  }>;
};

export default async function SctmPage({ searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const params = await searchParams;
  const familyFilter = (params.family ?? "").trim();
  const statusFilter = (params.status ?? "").trim();

  const logic = getControlAssessmentLogic();
  const adjudications = await getLatestAdjudicationsForOrg(orgId);

  // Build the visible row set.
  type Row = {
    controlId: string;
    family: string;
    status: string | null;
    confidence: number | null;
    requirementsTotal: number;
    requirementsSatisfied: number;
    computedAt: Date | null;
  };
  const rows: Row[] = logic.controls.map((control) => {
    const snap = adjudications.get(control.control_id);
    const reqs = snap
      ? ((snap.requirementsJson ?? []) as Array<{ satisfied: boolean }>)
      : [];
    return {
      controlId: control.control_id,
      family: control.family,
      status: snap?.status ?? null,
      confidence: snap?.confidence ?? null,
      requirementsTotal: control.register_requirements.length,
      requirementsSatisfied: reqs.filter((r) => r.satisfied).length,
      computedAt: snap?.computedAt ?? null,
    };
  });

  const families = Array.from(new Set(rows.map((r) => r.family))).sort();

  const filteredRows = rows.filter((r) => {
    if (familyFilter && r.family !== familyFilter) return false;
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "no_data") return r.status === null;
      if (r.status !== statusFilter) return false;
    }
    return true;
  });

  // Sort by family, then control_id (numerically when possible).
  filteredRows.sort((a, b) => {
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    return compareControlIds(a.controlId, b.controlId);
  });

  // Counters for the summary card.
  const counts = {
    satisfies: rows.filter((r) => r.status === "satisfies").length,
    partial: rows.filter((r) => r.status === "partial").length,
    at_risk: rows.filter((r) => r.status === "at_risk").length,
    gap: rows.filter((r) => r.status === "gap").length,
    no_data: rows.filter((r) => r.status === null).length,
  };

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
          SCTM — Control Adjudication
        </h1>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Per-control verdict derived from observed register entries.
          Continuously refreshed on every ISSO weekly export ingest. Phase 7
          of the Control Adjudication Ecosystem roadmap.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Status across {rows.length} controls
        </h2>
        <div className="mt-3 grid grid-cols-5 gap-2">
          <SummaryCell label="Satisfies" count={counts.satisfies} tone="emerald" />
          <SummaryCell label="At risk" count={counts.at_risk} tone="blue" />
          <SummaryCell label="Partial" count={counts.partial} tone="amber" />
          <SummaryCell label="Gap" count={counts.gap} tone="red" />
          <SummaryCell label="No data" count={counts.no_data} tone="gray" />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-3 text-xs">
          <span className="font-medium text-[var(--color-gray-700)]">Status:</span>
          {STATUS_FILTERS.map((f) => {
            const active = (statusFilter || "all") === f.key;
            const url = buildFilterUrl(familyFilter, f.key === "all" ? "" : f.key);
            return (
              <Link
                key={f.key}
                href={url}
                className={`rounded-full px-2 py-0.5 ${
                  active
                    ? "bg-[var(--color-navy-primary)] text-white"
                    : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)]"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
          <span className="ml-4 font-medium text-[var(--color-gray-700)]">Family:</span>
          <Link
            href={buildFilterUrl("", statusFilter)}
            className={`rounded-full px-2 py-0.5 ${
              !familyFilter
                ? "bg-[var(--color-navy-primary)] text-white"
                : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)]"
            }`}
          >
            All
          </Link>
          {families.map((f) => {
            const active = familyFilter === f;
            return (
              <Link
                key={f}
                href={buildFilterUrl(f, statusFilter)}
                className={`rounded-full px-2 py-0.5 ${
                  active
                    ? "bg-[var(--color-navy-primary)] text-white"
                    : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)]"
                }`}
              >
                {f}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        {filteredRows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-gray-500)]">
            No controls match these filters.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border-muted)]">
            {filteredRows.map((row) => (
              <li
                key={row.controlId}
                className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-[var(--color-gray-50)]/50"
              >
                <span className="w-16 shrink-0 font-mono text-xs text-[var(--color-gray-700)]">
                  {row.controlId}
                </span>
                <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
                  {row.family}
                </span>
                <div className="min-w-0 flex-1">
                  <StatusBadge
                    kind="adjudication"
                    status={row.status}
                    confidence={row.confidence}
                  />
                  {row.status === null && (
                    <span className="ml-2 text-[10px] text-[var(--color-gray-500)]">
                      no snapshot yet
                    </span>
                  )}
                  {row.status !== null && (
                    <span className="ml-2 text-[10px] text-[var(--color-gray-500)]">
                      {row.requirementsSatisfied}/{row.requirementsTotal} requirements ·
                      computed{" "}
                      {row.computedAt
                        ? new Date(row.computedAt).toLocaleString()
                        : "—"}
                    </span>
                  )}
                </div>
                <Link
                  href={`/dashboard/cae/${encodeURIComponent(row.controlId)}/implementation`}
                  className="shrink-0 text-[11px] text-[var(--color-blue-accent)] hover:underline"
                >
                  open →
                </Link>
              </li>
            ))}
          </ul>
        )}
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
    <div className={`rounded-md border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{count}</p>
    </div>
  );
}

function buildFilterUrl(family: string, status: string): string {
  const params = new URLSearchParams();
  if (family) params.set("family", family);
  if (status) params.set("status", status);
  const qs = params.toString();
  return `/dashboard/cae${qs ? "?" + qs : ""}`;
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
