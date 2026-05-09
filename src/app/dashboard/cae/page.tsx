import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { getLatestAdjudicationsForOrg } from "@/lib/evidence-engine/adjudication/scorer";
import { RescoreAllButton } from "./RescoreAllButton";

/**
 * /dashboard/cae — Control adjudication overview.
 *
 * Phase 7 of the Control Adjudication Ecosystem roadmap, modernized to
 * surface the canonical AG-aligned vocabulary (MET / NOT_MET / NA) plus
 * the met_via elevator (evidence / operational_plan_of_action /
 * enduring_exception / dod_cio_adjudication / esp_inheritance) that the
 * consolidated scorer now writes atomically per migration 0068.
 *
 * The legacy rollup (satisfies / partial / gap / at_risk) stays as a
 * secondary "engine signal" for sorting and confidence — but the
 * headline view is now what a C3PAO would actually read.
 */

const FINDING_FILTERS = [
  { key: "all", label: "All" },
  { key: "MET", label: "MET" },
  { key: "NOT_MET", label: "NOT MET" },
  { key: "NA", label: "N/A" },
] as const;

const MET_VIA_FILTERS = [
  { key: "all", label: "All" },
  { key: "evidence", label: "Direct evidence" },
  { key: "operational_plan_of_action", label: "POA&M elevator" },
  { key: "enduring_exception", label: "Enduring exception" },
  { key: "dod_cio_adjudication", label: "DoD CIO adjudication" },
  { key: "esp_inheritance", label: "ESP inheritance" },
] as const;

type PageProps = {
  searchParams: Promise<{
    family?: string;
    finding?: string;
    via?: string;
  }>;
};

const FINDING_TONES: Record<string, { bg: string; text: string; label: string }> = {
  MET: { bg: "bg-emerald-100", text: "text-emerald-800", label: "MET" },
  NOT_MET: { bg: "bg-red-100", text: "text-red-800", label: "NOT MET" },
  NA: { bg: "bg-zinc-100", text: "text-zinc-700", label: "N/A" },
};

const VIA_TONES: Record<string, { bg: string; text: string; label: string }> = {
  evidence: { bg: "bg-emerald-50", text: "text-emerald-700", label: "evidence" },
  operational_plan_of_action: { bg: "bg-amber-50", text: "text-amber-800", label: "POA&M" },
  enduring_exception: { bg: "bg-blue-50", text: "text-blue-800", label: "exception" },
  dod_cio_adjudication: { bg: "bg-purple-50", text: "text-purple-800", label: "DoD CIO" },
  esp_inheritance: { bg: "bg-slate-50", text: "text-slate-800", label: "ESP" },
  not_met: { bg: "bg-red-50", text: "text-red-700", label: "no elevator" },
  not_applicable: { bg: "bg-zinc-50", text: "text-zinc-700", label: "operator N/A" },
};

export default async function SctmPage({ searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!orgId) redirect("/auth/signin");

  const params = await searchParams;
  const familyFilter = (params.family ?? "").trim();
  const findingFilter = (params.finding ?? "").trim();
  const viaFilter = (params.via ?? "").trim();

  const logic = getControlAssessmentLogic();
  const adjudications = await getLatestAdjudicationsForOrg(orgId);

  type Row = {
    controlId: string;
    family: string;
    /** AG-aligned aggregate: MET / NOT_MET / NA (or null = no snapshot). */
    finding: string | null;
    /** How the requirement reaches the finding. */
    via: string | null;
    /** Legacy engine rollup for the secondary chip + sort. */
    rollup: string | null;
    confidence: number | null;
    requirementsTotal: number;
    requirementsSatisfied: number;
    objectivesTotal: number;
    objectivesMet: number;
    computedAt: Date | null;
  };

  const rows: Row[] = logic.controls.map((control) => {
    const snap = adjudications.get(control.control_id);
    const reqs = snap
      ? ((snap.requirementsJson ?? []) as Array<{ satisfied: boolean }>)
      : [];
    const objectives = snap
      ? ((snap.objectiveVerdicts ?? []) as Array<{ verdict: string }>)
      : [];
    return {
      controlId: control.control_id,
      family: control.family,
      finding: snap?.aggregateFinding ?? null,
      via: snap?.metVia ?? null,
      rollup: snap?.status ?? null,
      confidence: snap?.confidence ?? null,
      requirementsTotal: control.register_requirements.length,
      requirementsSatisfied: reqs.filter((r) => r.satisfied).length,
      objectivesTotal: objectives.length,
      objectivesMet: objectives.filter((o) => o.verdict === "MET").length,
      computedAt: snap?.computedAt ?? null,
    };
  });

  const families = Array.from(new Set(rows.map((r) => r.family))).sort();

  const filteredRows = rows.filter((r) => {
    if (familyFilter && r.family !== familyFilter) return false;
    if (findingFilter && findingFilter !== "all") {
      if (findingFilter === "no_data") {
        if (r.finding !== null) return false;
      } else if (r.finding !== findingFilter) {
        return false;
      }
    }
    if (viaFilter && viaFilter !== "all") {
      if (r.via !== viaFilter) return false;
    }
    return true;
  });

  filteredRows.sort((a, b) => {
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    return compareControlIds(a.controlId, b.controlId);
  });

  // Canonical AG-aligned summary.
  const findingCounts = {
    MET: rows.filter((r) => r.finding === "MET").length,
    NOT_MET: rows.filter((r) => r.finding === "NOT_MET").length,
    NA: rows.filter((r) => r.finding === "NA").length,
    no_data: rows.filter((r) => r.finding === null).length,
  };

  // met_via breakdown across the MET cohort — answers
  // "of the 110, how many are real-evidence MET vs elevator MET?"
  const metRows = rows.filter((r) => r.finding === "MET");
  const viaCounts = {
    evidence: metRows.filter((r) => r.via === "evidence").length,
    operational_plan_of_action: metRows.filter(
      (r) => r.via === "operational_plan_of_action",
    ).length,
    enduring_exception: metRows.filter((r) => r.via === "enduring_exception").length,
    dod_cio_adjudication: metRows.filter(
      (r) => r.via === "dod_cio_adjudication",
    ).length,
    esp_inheritance: metRows.filter((r) => r.via === "esp_inheritance").length,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
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
            Per-control verdict in the AG-aligned canonical vocabulary
            (MET / NOT MET / N/A) plus the met_via elevator. Single source
            of truth: the consolidated CAE scorer writes finding + elevator
            + per-objective verdicts atomically on every rescore.
          </p>
        </div>
        <RescoreAllButton canRescore={role === "Admin"} />
      </div>

      {/* Headline AG-aligned summary */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Aggregate finding across {rows.length} controls
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCell label="MET" count={findingCounts.MET} tone="emerald" />
          <SummaryCell label="NOT MET" count={findingCounts.NOT_MET} tone="red" />
          <SummaryCell label="N/A" count={findingCounts.NA} tone="gray" />
          <SummaryCell
            label="No data"
            count={findingCounts.no_data}
            tone="gray-soft"
          />
        </div>

        {/* met_via breakdown of the MET cohort */}
        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          MET breakdown by elevator ({findingCounts.MET} controls)
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <ViaCell label="Direct evidence" count={viaCounts.evidence} tone="emerald" />
          <ViaCell
            label="POA&M elevator"
            count={viaCounts.operational_plan_of_action}
            tone="amber"
          />
          <ViaCell
            label="Enduring exception"
            count={viaCounts.enduring_exception}
            tone="blue"
          />
          <ViaCell
            label="DoD CIO"
            count={viaCounts.dod_cio_adjudication}
            tone="purple"
          />
          <ViaCell
            label="ESP inheritance"
            count={viaCounts.esp_inheritance}
            tone="slate"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-3 text-xs">
          <span className="font-medium text-[var(--color-gray-700)]">Finding:</span>
          {FINDING_FILTERS.map((f) => {
            const active = (findingFilter || "all") === f.key;
            const url = buildFilterUrl(
              familyFilter,
              f.key === "all" ? "" : f.key,
              viaFilter,
            );
            return (
              <FilterPill key={f.key} href={url} active={active} label={f.label} />
            );
          })}

          <span className="ml-4 font-medium text-[var(--color-gray-700)]">Via:</span>
          {MET_VIA_FILTERS.map((f) => {
            const active = (viaFilter || "all") === f.key;
            const url = buildFilterUrl(
              familyFilter,
              findingFilter,
              f.key === "all" ? "" : f.key,
            );
            return (
              <FilterPill key={f.key} href={url} active={active} label={f.label} />
            );
          })}

          <span className="ml-4 font-medium text-[var(--color-gray-700)]">Family:</span>
          <FilterPill
            href={buildFilterUrl("", findingFilter, viaFilter)}
            active={!familyFilter}
            label="All"
          />
          {families.map((f) => {
            const active = familyFilter === f;
            return (
              <FilterPill
                key={f}
                href={buildFilterUrl(f, findingFilter, viaFilter)}
                active={active}
                label={f}
              />
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
                <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
                  {row.family}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FindingPill finding={row.finding} />
                    {row.via && row.finding === "MET" && row.via !== "evidence" && (
                      <ViaPill via={row.via} />
                    )}
                    {row.via === "not_applicable" && row.finding === "NA" && (
                      <ViaPill via="not_applicable" />
                    )}
                  </div>
                  {row.finding === null ? (
                    <p className="mt-1 text-[10px] text-[var(--color-gray-500)]">
                      no snapshot yet — awaiting first rescore
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-[var(--color-gray-500)]">
                      {row.objectivesMet}/{row.objectivesTotal} objectives MET ·{" "}
                      {row.requirementsSatisfied}/{row.requirementsTotal} requirements
                      satisfied · engine: {row.rollup ?? "—"}
                      {row.confidence !== null
                        ? ` (${Math.round(row.confidence * 100)}%)`
                        : ""}
                      {" · computed "}
                      {row.computedAt
                        ? new Date(row.computedAt).toLocaleString()
                        : "—"}
                    </p>
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
  tone: "emerald" | "amber" | "blue" | "red" | "gray" | "gray-soft";
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
            : tone === "gray-soft"
              ? "border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/30 text-[var(--color-gray-600)]"
              : "border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/40 text-[var(--color-gray-700)]";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold">{count}</p>
    </div>
  );
}

function ViaCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "amber" | "blue" | "purple" | "slate";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/30 text-emerald-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/30 text-amber-900"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50/30 text-blue-900"
          : tone === "purple"
            ? "border-purple-200 bg-purple-50/30 text-purple-900"
            : "border-slate-200 bg-slate-50/30 text-slate-800";
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{count}</p>
    </div>
  );
}

function FindingPill({ finding }: { finding: string | null }) {
  if (!finding) {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-gray-600)]">
        No data
      </span>
    );
  }
  const tone = FINDING_TONES[finding] ?? FINDING_TONES.NA;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text}`}
    >
      {tone.label}
    </span>
  );
}

function ViaPill({ via }: { via: string }) {
  const tone = VIA_TONES[via] ?? {
    bg: "bg-zinc-50",
    text: "text-zinc-700",
    label: via,
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${tone.bg} ${tone.text}`}
    >
      via {tone.label}
    </span>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-2 py-0.5 ${
        active
          ? "bg-[var(--color-navy-primary)] text-white"
          : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)]"
      }`}
    >
      {label}
    </Link>
  );
}

function buildFilterUrl(family: string, finding: string, via: string): string {
  const params = new URLSearchParams();
  if (family) params.set("family", family);
  if (finding) params.set("finding", finding);
  if (via) params.set("via", via);
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
