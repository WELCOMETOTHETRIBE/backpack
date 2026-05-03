import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

// Same rationale as /dashboard/page.tsx: this page renders rollup-derived
// state (SPRS, readiness checklist) that must reflect the latest DB after
// any attestation, register entry, or IR bundle archive.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ListChecks, ShieldAlert, FileText, ArrowRight, ClipboardCheck } from "lucide-react";
import { db } from "@/db";
import {
  getSprsScore,
  sprsScoringData,
  SPRS_MIN,
  SPRS_MAX,
  SPRS_RANGE,
} from "@/lib/sprs";
import {
  controlRecords,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
  governanceArtifactCompletions,
  artifacts,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import {
  isRegisterLaneSatisfied,
  finalCountForSchemaId,
  isProvisionedForSchemaId,
} from "@/lib/registers/compliance-health";
import { RecalculateControlsButton } from "./RecalculateControlsButton";

const cardClass =
  "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

const TOTAL_CONTROLS = ALL_CONTROL_IDS.length;
const ADJUDICATED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

const sprs5 = sprsScoringData.filter((c) => c.value === 5).length;
const sprs3 = sprsScoringData.filter((c) => c.value === 3).length;
const sprs1 = sprsScoringData.filter((c) => c.value === 1).length;

function ProgressBar({ pct, className = "bg-[var(--color-blue-accent)]" }: { pct: number; className?: string }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-gray-100)]">
      <div
        className={`h-full rounded-full transition-all duration-500 ${className}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default async function ReadinessPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const sprsScore = await getSprsScore(orgId);

  const records = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  // ── Register satisfaction (drives the implemented count) ──
  const intelMap = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));
  const orgRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));
  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);

  const registerFinalCounts = new Map<string, number>();
  if (boundaryIds.length > 0) {
    for (const reg of orgRegisters) {
      const [row] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(governanceRegisterEntries)
        .where(
          and(
            eq(governanceRegisterEntries.registerId, reg.id),
            eq(governanceRegisterEntries.status, "final"),
            sql`${governanceRegisterEntries.boundaryId} IN (${sql.join(
              boundaryIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        );
      registerFinalCounts.set(reg.registerKey, row?.cnt ?? 0);
    }
  }
  const orgProvisionedRegisterKeys = new Set(orgRegisters.map((r) => r.registerKey));
  const registerSatisfiedMap = new Map<string, boolean>();
  for (const [controlId, intel] of intelMap) {
    if (!intel.registerRequired || !intel.registerSchemaId) {
      registerSatisfiedMap.set(controlId, true);
      continue;
    }
    registerSatisfiedMap.set(
      controlId,
      isRegisterLaneSatisfied({
        registerSchemaId: intel.registerSchemaId,
        finalEntryCount: finalCountForSchemaId(registerFinalCounts, intel.registerSchemaId),
        orgProvisioned: isProvisionedForSchemaId(orgProvisionedRegisterKeys, intel.registerSchemaId),
      }),
    );
  }

  const implemented = records.filter((r) => {
    const registerOk = registerSatisfiedMap.get(r.controlId) !== false;
    if (r.policyDocRequired) {
      return r.technicalStatus === "satisfied" && r.policyStatus === "satisfied" && registerOk;
    }
    return ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number]) && registerOk;
  }).length;
  const total = records.length || TOTAL_CONTROLS;
  const compliancePct = total > 0 ? Math.round((implemented / total) * 100) : 0;
  const controlsImplementedPct = TOTAL_CONTROLS > 0 ? Math.round((implemented / TOTAL_CONTROLS) * 100) : 0;
  const sprsPct = SPRS_RANGE > 0 ? Math.round(((sprsScore - SPRS_MIN) / SPRS_RANGE) * 100) : 0;

  // ── Annual workflow status: outstanding count + risk-assessment state ──
  const outstandingCount = records.filter((r) => {
    const registerOk = registerSatisfiedMap.get(r.controlId) !== false;
    if (r.policyDocRequired) {
      return !(r.technicalStatus === "satisfied" && r.policyStatus === "satisfied" && registerOk);
    }
    return !(ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number]) && registerOk);
  }).length;

  // Risk assessment program state (used to color the workflow card)
  let raSigned = false;
  let raReportUploaded = false;
  const ra311Record = records.find((r) => r.controlId === "3.11.1");
  if (ra311Record) {
    const [sig] = await db
      .select({ id: governanceArtifactCompletions.id })
      .from(governanceArtifactCompletions)
      .where(
        and(
          eq(governanceArtifactCompletions.controlRecordId, ra311Record.id),
          eq(governanceArtifactCompletions.artifactLabel, "risk_assessment_program"),
          sql`${governanceArtifactCompletions.attestedBy} IS NOT NULL`,
        ),
      )
      .limit(1);
    raSigned = Boolean(sig);
    const [report] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.controlRecordId, ra311Record.id),
          eq(artifacts.milestoneKey, "RA.3.11.1.annual_risk_assessment"),
          sql`${artifacts.fileUrl} IS NOT NULL`,
        ),
      )
      .limit(1);
    raReportUploaded = Boolean(report);
  }
  const raComplete = raSigned && raReportUploaded;
  const raStatus: "complete" | "partial" | "not_started" = raComplete
    ? "complete"
    : raSigned || raReportUploaded
      ? "partial"
      : "not_started";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-navy-primary)]">Readiness &amp; Audit</h1>
          <p className="mt-1.5 text-sm text-[var(--color-gray-600)]">
            Annual and periodic governance work that produces assessor-facing artifacts.
            The sidebar surfaces the daily / weekly operational pages — this page is the
            home for cyclical workflows.
          </p>
        </div>
        <RecalculateControlsButton />
      </header>

      {/* ── Readiness summary: 3 stats ───────────────────────────── */}
      <section className={cardClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Current readiness
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--color-gray-500)]">Compliance</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-navy-primary)]">{compliancePct}%</p>
            <div className="mt-2">
              <ProgressBar pct={compliancePct} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
              {implemented} / {TOTAL_CONTROLS} controls adjudicated
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-gray-500)]">SPRS Score</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-blue-accent)]">{sprsScore}</p>
            <div className="mt-2">
              <ProgressBar pct={sprsPct} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
              Range {SPRS_MIN} to {SPRS_MAX} · DoD Assessment Methodology
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-gray-500)]">Controls implemented</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-navy-primary)]">
              {implemented}<span className="text-base font-normal text-[var(--color-gray-400)]"> / {TOTAL_CONTROLS}</span>
            </p>
            <div className="mt-2">
              <ProgressBar pct={controlsImplementedPct} className="bg-emerald-600" />
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
              {outstandingCount} still outstanding
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">
            <span className="tabular-nums font-bold">{sprs5}</span> High (5)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
            <span className="tabular-nums font-bold">{sprs3}</span> Medium (3)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-800">
            <span className="tabular-nums font-bold">{sprs1}</span> Basic (1)
          </span>
        </div>
      </section>

      {/* ── Annual workflows hub ─────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Annual workflows
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <WorkflowCard
            href="/dashboard/readiness/outstanding"
            icon={ListChecks}
            title="Outstanding Controls Wizard"
            subtitle="Close the remaining controls grouped by effort"
            statusLabel={
              outstandingCount === 0
                ? "All controls adjudicated"
                : `${outstandingCount} outstanding`
            }
            tone={outstandingCount === 0 ? "good" : "warn"}
            ctaLabel={outstandingCount === 0 ? "Review" : "Continue"}
          />
          <WorkflowCard
            href="/dashboard/readiness/risk-assessment"
            icon={ShieldAlert}
            title="Annual Risk Assessment"
            subtitle="3.11.1 — sign program attestation + upload report"
            statusLabel={
              raStatus === "complete"
                ? "Complete"
                : raStatus === "partial"
                  ? "In progress"
                  : "Not started"
            }
            tone={raStatus === "complete" ? "good" : raStatus === "partial" ? "warn" : "bad"}
            ctaLabel={raStatus === "complete" ? "Review" : "Open workflow"}
          />
          <WorkflowCard
            href="/dashboard/readiness/mock-assessment"
            icon={ClipboardCheck}
            title="Mock Assessment Simulator"
            subtitle="Practice the C3PAO Examine / Test / Interview flow"
            statusLabel="Self-paced"
            tone="neutral"
            ctaLabel="Run a mock"
          />
        </div>
      </section>
    </div>
  );
}

function WorkflowCard({
  href,
  icon: Icon,
  title,
  subtitle,
  statusLabel,
  tone,
  ctaLabel,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  statusLabel: string;
  tone: "good" | "warn" | "bad" | "neutral";
  ctaLabel: string;
}) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800"
        : tone === "bad"
          ? "bg-red-100 text-red-800"
          : "bg-slate-100 text-slate-700";
  return (
    <Link
      href={href}
      className="group block rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition hover:border-[var(--color-blue-accent)]/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-blue-accent)]/10">
          <Icon className="h-5 w-5 text-[var(--color-blue-accent)]" />
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${toneClass}`}>
          {statusLabel}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--color-navy-primary)] group-hover:text-[var(--color-blue-accent)]">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[var(--color-gray-600)]">{subtitle}</p>
      <p className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-blue-accent)]">
        {ctaLabel} <ArrowRight className="h-3 w-3" />
      </p>
    </Link>
  );
}
