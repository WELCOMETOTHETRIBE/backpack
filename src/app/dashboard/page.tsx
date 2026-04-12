import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import ExportButton from "@/components/ExportButton";
import FlowDownBanner from "@/components/FlowDownBanner";
import { DashboardSetupWidget } from "./DashboardSetupWidget";
import {
  controlRecords,
  poamItems,
  poamEntries,
  poamEntryMilestones,
  evidenceMetadata,
  controlEvidenceLinks,
  auditLogs,
  users,
  subcontractorRelationships,
  boundaryProfiles,
  organizations,
  sspSections,
} from "@/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { sprsScoringData, SPRS_MAX } from "@/lib/sprs";
import {
  Shield,
  FileStack,
  CheckCircle2,
  AlertTriangle,
  Server,
  ChevronRight,
  TrendingUp,
  Info,
  ChevronDown,
} from "lucide-react";

const TOTAL_CONTROLS = ALL_CONTROL_IDS.length;
const ADJUDICATED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;
const IMPLEMENTED_STATUSES = ["implemented", "assessed", "inherited"] as const;

// NIST family short names for the breakdown table
const NIST_FAMILIES = [
  { code: "3.1", name: "Access Control", abbr: "AC" },
  { code: "3.2", name: "Awareness & Training", abbr: "AT" },
  { code: "3.3", name: "Audit & Accountability", abbr: "AU" },
  { code: "3.4", name: "Configuration Mgmt", abbr: "CM" },
  { code: "3.5", name: "Identification & Auth", abbr: "IA" },
  { code: "3.6", name: "Incident Response", abbr: "IR" },
  { code: "3.7", name: "Maintenance", abbr: "MA" },
  { code: "3.8", name: "Media Protection", abbr: "MP" },
  { code: "3.9", name: "Personnel Security", abbr: "PS" },
  { code: "3.10", name: "Physical Protection", abbr: "PE" },
  { code: "3.11", name: "Risk Assessment", abbr: "RA" },
  { code: "3.12", name: "Security Assessment", abbr: "CA" },
  { code: "3.13", name: "System & Comms Protect", abbr: "SC" },
  { code: "3.14", name: "System & Info Integrity", abbr: "SI" },
];

// SPRS family short names (match sprsScoringData.family strings)
const FAMILY_ABBR: Record<string, string> = {
  "Access Control": "AC",
  "Awareness and Training": "AT",
  "Audit and Accountability": "AU",
  "Configuration Management": "CM",
  "Identification and Authentication": "IA",
  "Incident Response": "IR",
  "Maintenance": "MA",
  "Media Protection": "MP",
  "Personnel Security": "PS",
  "Physical Protection": "PE",
  "Risk Assessment": "RA",
  "Security Assessment": "CA",
  "System and Communications Protection": "SC",
  "System and Information Integrity": "SI",
};

function ReadinessRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[var(--color-gray-900)]">{score}</span>
        <span className="text-[10px] font-medium text-[var(--color-gray-500)]">/ 100</span>
      </div>
    </div>
  );
}

function SprsRing({ score }: { score: number }) {
  // SPRS range is -203 to 110 (range = 313). Map to 0–100% for the ring.
  const SPRS_MIN = -203;
  const SPRS_RANGE = 313;
  const pct = Math.max(0, Math.min(100, ((score - SPRS_MIN) / SPRS_RANGE) * 100));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;
  const color = score >= 88 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[var(--color-gray-900)]">{score}</span>
        <span className="text-[10px] font-medium text-[var(--color-gray-500)]">/ 110</span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as { role?: string; organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // ── Control records ──
  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
      sprs31311Condition: controlRecords.sprs31311Condition,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  function isFullyAdjudicated(r: (typeof records)[0]): boolean {
    if (r.policyDocRequired) {
      return r.technicalStatus === "satisfied" && r.policyStatus === "satisfied";
    }
    return ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number]);
  }

  const adjudicatedCount = records.filter(isFullyAdjudicated).length;
  const outstandingCount = Math.max(0, TOTAL_CONTROLS - adjudicatedCount);
  const implementedPct = TOTAL_CONTROLS ? Math.round((adjudicatedCount / TOTAL_CONTROLS) * 100) : 0;
  const needingReview = records.filter(
    (r) => r.implementationStatus === "not_started" || r.implementationStatus === "in_progress"
  ).length;

  // ── Status bin counts (for the clickable breakdown chips) ──
  // Counts against ALL 110 controls; missing records count as not_started (outstanding)
  const statusBins = (() => {
    const byId = new Map(records.map((r) => [r.controlId, r.implementationStatus]));
    let implemented = 0, inherited = 0, notApplicable = 0;
    for (const id of ALL_CONTROL_IDS) {
      const s = byId.get(id);
      if (s === "implemented" || s === "assessed") implemented++;
      else if (s === "inherited") inherited++;
      else if (s === "not_applicable") notApplicable++;
    }
    const outstanding = TOTAL_CONTROLS - implemented - inherited - notApplicable;
    return { implemented, inherited, notApplicable, outstanding };
  })();

  // ── NIST family breakdown (in-memory) ──
  const familyStats = NIST_FAMILIES.map((f) => {
    const familyIds = ALL_CONTROL_IDS.filter((id) => id.startsWith(f.code + "."));
    const total = familyIds.length;
    const done = records.filter(
      (r) => familyIds.includes(r.controlId) && isFullyAdjudicated(r)
    ).length;
    return { ...f, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  });

  // ── SPRS score computation ──
  const recordMap = new Map(records.map((r) => [r.controlId, r]));
  const implementedIds = new Set(
    records.filter(
      (r) =>
        r.implementationStatus === "implemented" ||
        r.implementationStatus === "assessed" ||
        r.implementationStatus === "inherited"
    ).map((r) => r.controlId)
  );

  const record31311 = recordMap.get("3.13.11");
  const isNonFips =
    record31311 &&
    !implementedIds.has("3.13.11") &&
    record31311.sprs31311Condition === "non_fips";

  let sprsScore = SPRS_MAX;
  const sprsGaps: Array<{ id: string; family: string; abbr: string; deduction: number }> = [];

  for (const ctrl of sprsScoringData) {
    if (!implementedIds.has(ctrl.id)) {
      const deduction = ctrl.id === "3.13.11" && isNonFips ? 3 : ctrl.value;
      sprsScore -= deduction;
      sprsGaps.push({
        id: ctrl.id,
        family: ctrl.family,
        abbr: FAMILY_ABBR[ctrl.family] ?? ctrl.family.slice(0, 2).toUpperCase(),
        deduction,
      });
    }
  }

  // Group gaps by family for drill-down, sorted by total deduction desc
  type GapFamily = { family: string; abbr: string; totalDeduction: number; controls: typeof sprsGaps };
  const gapsByFamily = new Map<string, GapFamily>();
  for (const gap of sprsGaps) {
    if (!gapsByFamily.has(gap.family)) {
      gapsByFamily.set(gap.family, { family: gap.family, abbr: gap.abbr, totalDeduction: 0, controls: [] });
    }
    const entry = gapsByFamily.get(gap.family)!;
    entry.totalDeduction += gap.deduction;
    entry.controls.push(gap);
  }
  const sprsGapFamilies = [...gapsByFamily.values()].sort((a, b) => b.totalDeduction - a.totalDeduction);

  const sprsLabel = sprsScore >= 88 ? "Strong" : sprsScore >= 70 ? "Moderate" : sprsScore >= 0 ? "At risk" : "Critical";
  const sprsPointsLost = SPRS_MAX - sprsScore;

  // ── POA&M ──
  const openPoam = await db
    .select({ status: poamItems.status })
    .from(poamItems)
    .where(eq(poamItems.organizationId, orgId));
  const openPoamCount = openPoam.filter((p) => p.status !== "Closed").length;

  const openPoamList = await db
    .select({ id: poamEntries.id })
    .from(poamEntries)
    .where(and(eq(poamEntries.organizationId, orgId), eq(poamEntries.status, "open")));
  let poamWithMilestones = 0;
  for (const entry of openPoamList) {
    const [ms] = await db
      .select({ id: poamEntryMilestones.id })
      .from(poamEntryMilestones)
      .where(eq(poamEntryMilestones.poamEntryId, entry.id))
      .limit(1);
    if (ms) poamWithMilestones++;
  }
  const newModelOpenCount = openPoamList.length;
  const poamMissingMilestones = newModelOpenCount - poamWithMilestones;

  // ── Evidence expiry ──
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringSoon = await db
    .select({ id: controlEvidenceLinks.id })
    .from(controlEvidenceLinks)
    .where(and(eq(controlEvidenceLinks.organizationId, orgId), lt(controlEvidenceLinks.expiresAt, in30Days)));
  const expiringSoonCount = expiringSoon.length;
  const evidence = await db
    .select({ retentionUntil: evidenceMetadata.retentionUntil })
    .from(evidenceMetadata)
    .where(eq(evidenceMetadata.organizationId, orgId));
  const legacyExpiring = evidence.filter(
    (e) => e.retentionUntil && new Date(e.retentionUntil) <= in30Days
  ).length;
  const totalExpiring = expiringSoonCount + legacyExpiring;

  // ── SSP sections ──
  const sspSectionList = await db
    .select({ content: sspSections.content })
    .from(sspSections)
    .where(eq(sspSections.organizationId, orgId));
  const authoredSections = sspSectionList.filter(
    (s) => s.content && s.content.trim().length > 0
  ).length;

  // ── Recent activity ──
  const recentActivity = await db
    .select({
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.organizationId, orgId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(5);
  const daysSinceActivity = recentActivity[0]
    ? Math.floor((Date.now() - new Date(recentActivity[0].createdAt).getTime()) / 86_400_000)
    : null;

  // ── Flow-down ──
  const activeFlowdowns = await db
    .select()
    .from(subcontractorRelationships)
    .where(
      and(
        eq(subcontractorRelationships.subOrganizationId, orgId),
        eq(subcontractorRelationships.status, "Active")
      )
    );
  const primeCount = activeFlowdowns.length;

  // ── Onboarding ──
  const [boundaryRow] = await db
    .select({ id: boundaryProfiles.id })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, orgId))
    .limit(1);
  const onboardingStarted = Boolean(boundaryRow) || records.length > 0;

  // ── Org profile ──
  const [orgRow] = await db
    .select({
      name: organizations.name,
      cageCode: organizations.cageCode,
      cmmcTargetLevel: organizations.cmmcTargetLevel,
      boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const boundaryComplete = !!orgRow?.boundaryScopingCompletedAt;

  // ── C3PAO Readiness Checklist score (internal indicator only, not SPRS) ──
  const sspHasContent = authoredSections >= 3;
  const controlsAt80pct = implementedPct >= 80;
  const poamHasMilestones = newModelOpenCount === 0 || poamMissingMilestones === 0;
  const noExpiredEvidence = totalExpiring === 0;

  const readinessScore =
    (boundaryComplete ? 20 : 0) +
    (sspHasContent ? 20 : 0) +
    (controlsAt80pct ? 30 : 0) +
    (poamHasMilestones ? 15 : 0) +
    (noExpiredEvidence ? 15 : 0);

  const readinessColor =
    readinessScore >= 70 ? "text-emerald-600" : readinessScore >= 40 ? "text-amber-600" : "text-red-600";

  const readinessBreakdown = [
    { label: "Boundary scoping complete", points: 20, earned: boundaryComplete, href: "/dashboard/boundary" },
    { label: "SSP has ≥3 authored sections", points: 20, earned: sspHasContent, href: "/dashboard/ssp" },
    { label: "≥80% controls implemented", points: 30, earned: controlsAt80pct, href: "/dashboard/controls" },
    { label: "All open POA&Ms have milestones", points: 15, earned: poamHasMilestones, href: "/dashboard/poam" },
    { label: "No evidence expiring within 30 days", points: 15, earned: noExpiredEvidence, href: "/dashboard/evidence" },
  ];

  // ── Next actions ──
  const nextActions: Array<{ label: string; href: string; urgent?: boolean }> = [];
  if (!boundaryComplete)
    nextActions.push({ label: "Complete system boundary scoping", href: "/dashboard/boundary", urgent: true });
  if (needingReview > 0)
    nextActions.push({ label: `Adjudicate ${needingReview} remaining controls`, href: "/dashboard/controls" });
  if (poamMissingMilestones > 0)
    nextActions.push({ label: `Add milestones to ${poamMissingMilestones} open POA&M item${poamMissingMilestones !== 1 ? "s" : ""}`, href: "/dashboard/poam", urgent: true });
  if (totalExpiring > 0)
    nextActions.push({ label: `Review ${totalExpiring} expiring evidence item${totalExpiring !== 1 ? "s" : ""}`, href: "/dashboard/evidence", urgent: true });
  if (!sspHasContent)
    nextActions.push({ label: `Author SSP sections (${authoredSections}/3 minimum)`, href: "/dashboard/ssp" });

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
        <DashboardSetupWidget onboardingStarted={onboardingStarted} />

        {primeCount > 0 && <FlowDownBanner primeCount={primeCount} />}

        {/* ════════════════════════════════════════════════════════
            SECTION 1 — THREE SCORE CARDS (side by side)
            Control Adjudication | C3PAO Readiness | SPRS Score
        ════════════════════════════════════════════════════════ */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* 1a — Control Adjudication */}
          <section className={cardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
                  Controls Adjudicated
                </p>
                <p className="mt-1 text-3xl font-bold text-[var(--color-navy-primary)]">
                  {adjudicatedCount}
                  <span className="text-lg font-normal text-[var(--color-gray-400)]"> / {TOTAL_CONTROLS}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                  {outstandingCount > 0
                    ? `${outstandingCount} controls still need a status`
                    : "All controls have a resolved status"}
                </p>
              </div>
              <Shield className="h-5 w-5 shrink-0 text-[var(--color-gray-300)] mt-0.5" />
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-gray-100)]">
              <div
                className={`h-full rounded-full transition-all ${
                  implementedPct === 100 ? "bg-emerald-500" : implementedPct >= 50 ? "bg-blue-500" : "bg-amber-400"
                }`}
                style={{ width: `${implementedPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-gray-500)]">{implementedPct}% implemented or inherited</p>

            {/* Clickable status bins */}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {[
                {
                  label: "Implemented",
                  count: statusBins.implemented,
                  status: "implemented",
                  cls: "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-400",
                  dot: "bg-emerald-500",
                },
                {
                  label: "Inherited",
                  count: statusBins.inherited,
                  status: "inherited",
                  cls: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900/30 dark:border-slate-700/40 dark:text-slate-400",
                  dot: "bg-slate-400",
                },
                {
                  label: "Not Applicable",
                  count: statusBins.notApplicable,
                  status: "not_applicable",
                  cls: "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800/40 dark:border-gray-700 dark:text-gray-400",
                  dot: "bg-gray-400",
                },
                {
                  label: "Outstanding",
                  count: statusBins.outstanding,
                  status: "outstanding",
                  cls: statusBins.outstanding > 0
                    ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-700/40 dark:text-amber-400"
                    : "bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/40 dark:border-gray-700 dark:text-gray-500",
                  dot: statusBins.outstanding > 0 ? "bg-amber-400" : "bg-gray-300",
                },
              ].map(({ label, count, status, cls, dot }) => (
                <Link
                  key={status}
                  href={`/dashboard/controls?status=${status}`}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${cls}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                    {label}
                  </span>
                  <span className="font-bold tabular-nums">{count}</span>
                </Link>
              ))}
            </div>

            <Link
              href="/dashboard/controls"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              Open SCTM <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </section>

          {/* 1b — C3PAO Readiness Checklist */}
          <section className={cardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
                  C3PAO Readiness Checklist
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--color-gray-400)]">
                  Internal indicator — not submitted to SPRS
                </p>
              </div>
              <ReadinessRing score={readinessScore} />
            </div>
            <div className="mt-2 space-y-1.5">
              {readinessBreakdown.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div
                    className={`h-3.5 w-3.5 shrink-0 rounded-full flex items-center justify-center ${
                      item.earned ? "bg-emerald-100" : "bg-[var(--color-gray-100)]"
                    }`}
                  >
                    {item.earned ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gray-300)]" />
                    )}
                  </div>
                  <span className="flex-1 text-[11px] text-[var(--color-gray-600)] leading-tight">
                    {item.earned ? (
                      item.label
                    ) : (
                      <Link href={item.href} className="hover:underline hover:text-[var(--color-blue-accent)]">
                        {item.label}
                      </Link>
                    )}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      item.earned ? readinessColor : "text-[var(--color-gray-400)]"
                    }`}
                  >
                    {item.earned ? `+${item.points}` : `+0`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 1c — SPRS Score (official) */}
          <section className={cardClass}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
                  SPRS Score
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--color-gray-400)]">
                  DoD Assessment Methodology — submitted to SPRS.mil
                </p>
              </div>
              <SprsRing score={sprsScore} />
            </div>

            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  sprsScore >= 88
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : sprsScore >= 70
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {sprsLabel}
              </span>
              {sprsPointsLost > 0 && (
                <span className="text-xs text-[var(--color-gray-500)]">
                  {sprsPointsLost} pts deducted from {SPRS_MAX}
                </span>
              )}
            </div>

            {/* SPRS drill-down: which controls are dragging the score down */}
            {sprsGaps.length > 0 && (
              <details className="mt-3 group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-[var(--color-blue-accent)] hover:underline">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  {sprsGaps.length} control{sprsGaps.length !== 1 ? "s" : ""} impacting score
                </summary>

                <div className="mt-2 max-h-52 overflow-y-auto space-y-1 pr-1">
                  {sprsGapFamilies.map((fam) => (
                    <div key={fam.family} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] dark:bg-gray-800/40">
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-[var(--color-gray-500)]">
                            {fam.abbr}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--color-gray-700)] dark:text-gray-300">
                            {fam.family}
                          </span>
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          -{fam.totalDeduction} pts
                        </span>
                      </div>
                      <div className="border-t border-[var(--color-border)] px-3 py-1.5">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {fam.controls
                            .sort((a, b) => b.deduction - a.deduction)
                            .map((ctrl) => (
                              <Link
                                key={ctrl.id}
                                href={`/dashboard/controls/${ctrl.id}`}
                                className="flex items-center gap-1 font-mono text-[11px] text-[var(--color-gray-600)] hover:text-[var(--color-blue-accent)] dark:text-gray-400"
                              >
                                <span
                                  className={`rounded px-1 py-0 text-[9px] font-bold ${
                                    ctrl.deduction === 5
                                      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                      : ctrl.deduction === 3
                                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                  }`}
                                >
                                  -{ctrl.deduction}
                                </span>
                                {ctrl.id}
                              </Link>
                            ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--color-gray-400)]">
                  Color = deduction weight: red = −5 pts, amber = −3 pts, gray = −1 pt.
                  Click any control ID to adjudicate.
                </p>
              </details>
            )}

            {sprsScore === SPRS_MAX && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All 110 controls implemented — maximum SPRS score achieved.
              </div>
            )}
          </section>
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 2 — KPI grid
        ════════════════════════════════════════════════════════ */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Controls needing review</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">{needingReview}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Open POA&Ms</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">{openPoamCount}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Evidence expiring (30 d)</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                totalExpiring > 0 ? "text-amber-600" : "text-[var(--color-navy-primary)]"
              }`}
            >
              {totalExpiring}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">System Boundary</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  boundaryComplete ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <p
                className={`text-sm font-semibold ${
                  boundaryComplete ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {boundaryComplete ? "Complete" : "Incomplete"}
              </p>
            </div>
            {!boundaryComplete && (
              <Link
                href="/dashboard/boundary"
                className="mt-1 block text-xs text-[var(--color-blue-accent)] hover:underline"
              >
                Complete now →
              </Link>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 3 — NIST Family Breakdown + Next Actions
        ════════════════════════════════════════════════════════ */}
        <div className="grid gap-6 lg:grid-cols-5">
          <section className={`${cardClass} lg:col-span-3`}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">NIST Family Breakdown</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Family</th>
                    <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Done</th>
                    <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Total</th>
                    <th className="pb-2 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {familyStats.map((f) => (
                    <tr key={f.code} className="py-1">
                      <td className="py-1.5 pr-2">
                        <span className="font-mono text-[11px] text-[var(--color-gray-400)] mr-1.5">{f.abbr}</span>
                        <span className="text-xs text-[var(--color-gray-700)]">{f.name}</span>
                      </td>
                      <td className="py-1.5 text-right text-xs font-semibold text-[var(--color-gray-800)]">{f.done}</td>
                      <td className="py-1.5 text-right text-xs text-[var(--color-gray-500)]">{f.total}</td>
                      <td className="py-1.5 pl-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-gray-100)]">
                            <div
                              className={`h-full rounded-full transition-all ${
                                f.pct === 100 ? "bg-emerald-500" : f.pct >= 50 ? "bg-blue-500" : "bg-amber-400"
                              }`}
                              style={{ width: `${f.pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-[var(--color-gray-500)]">{f.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${cardClass} lg:col-span-2`}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Next Actions</h2>
            {nextActions.length === 0 ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                All readiness criteria met.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {nextActions.map((action, i) => (
                  <li key={i}>
                    <Link
                      href={action.href}
                      className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium text-[var(--color-gray-700)] transition-colors hover:border-[var(--color-blue-accent)]/40 hover:bg-[var(--color-gray-50)]"
                    >
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          action.urgent ? "bg-red-400" : "bg-[var(--color-gray-300)]"
                        }`}
                      />
                      <span className="flex-1 leading-snug">{action.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-gray-400)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* SPRS context note */}
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] px-3 py-2.5 dark:bg-gray-800/40">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--color-gray-500)]" />
                <span className="text-xs font-medium text-[var(--color-gray-700)] dark:text-gray-300">
                  SPRS: {sprsScore}{" "}
                  <span
                    className={`font-semibold ${
                      sprsScore >= 88 ? "text-emerald-600" : sprsScore >= 70 ? "text-amber-600" : "text-red-600"
                    }`}
                  >
                    ({sprsLabel})
                  </span>
                </span>
              </div>
              {sprsPointsLost > 0 && (
                <p className="mt-0.5 text-[10px] text-[var(--color-gray-400)]">
                  {sprsPointsLost} points deducted · {sprsGaps.length} controls unimplemented
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 4 — Governance documents CTA
        ════════════════════════════════════════════════════════ */}
        <section className={cardClass}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Governance Documents</h2>
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                Upload policies and procedures, adjudicate the 18 governance controls, and manage routine logs and records.
              </p>
            </div>
            <Link
              href="/dashboard/documents"
              className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <FileStack className="h-4 w-4" aria-hidden />
              Open Documents
            </Link>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            SECTION 5 — Recent activity + Org + Export
        ════════════════════════════════════════════════════════ */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className={cardClass}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Recent Activity</h2>
              {daysSinceActivity !== null && (
                <span className="text-xs text-[var(--color-gray-400)]">
                  {daysSinceActivity === 0 ? "Today" : `${daysSinceActivity}d ago`}
                </span>
              )}
            </div>
            {recentActivity.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-gray-500)]">No recent activity</p>
            ) : (
              <ul className="mt-2 space-y-2" aria-label="Recent activity">
                {recentActivity.map((a, i) => (
                  <li key={i} className="text-sm text-[var(--color-gray-700)]">
                    <span className="font-medium">{a.userName ?? "System"}</span> {a.action}{" "}
                    {a.resourceType}
                    <span className="ml-1 text-[var(--color-gray-500)]">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Organization</h2>
            {orgRow?.name && (
              <p className="mt-1 text-sm font-medium text-[var(--color-gray-900)]">{orgRow.name}</p>
            )}
            {orgRow?.cageCode && (
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">CAGE {orgRow.cageCode}</p>
            )}
            {orgRow?.cmmcTargetLevel && (
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                {orgRow.cmmcTargetLevel === "Level2" ? "CMMC Level 2" : orgRow.cmmcTargetLevel}
              </p>
            )}
            {!orgRow?.name && !orgRow?.cageCode && !orgRow?.cmmcTargetLevel && (
              <p className="mt-2 text-sm text-[var(--color-gray-500)]">
                Complete profile in{" "}
                <Link href="/dashboard/settings" className="text-[var(--color-blue-accent)] hover:underline">
                  Settings
                </Link>
              </p>
            )}
            {/* Score legend */}
            <div className="mt-4 space-y-1 border-t border-[var(--color-border)] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Score guide</p>
              <div className="flex items-center gap-2">
                <Info className="h-3 w-3 shrink-0 text-[var(--color-gray-400)]" />
                <p className="text-[10px] text-[var(--color-gray-500)]">
                  <strong>SPRS</strong> = official DoD score (−203 to 110), submitted to SPRS.mil
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Info className="h-3 w-3 shrink-0 text-[var(--color-gray-400)]" />
                <p className="text-[10px] text-[var(--color-gray-500)]">
                  <strong>C3PAO Readiness</strong> = internal pre-assessment checklist (0–100), not official
                </p>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Assessment Package</h2>
            <p className="mt-1 text-xs text-[var(--color-gray-500)]">
              Export a ZIP containing your SSP, POA&M, SCTM, and evidence index for C3PAO submission.
            </p>
            <div className="mt-3">
              <ExportButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
