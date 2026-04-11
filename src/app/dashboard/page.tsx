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
import {
  Shield,
  FileStack,
  CheckCircle2,
  AlertTriangle,
  Server,
  ChevronRight,
} from "lucide-react";

const TOTAL_CONTROLS = ALL_CONTROL_IDS.length;
const ADJUDICATED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;
const IMPLEMENTED_STATUSES = ["implemented", "assessed", "inherited"] as const;

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
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  // A control is "fully adjudicated" when its combined status is resolved:
  // - policy not required: implementationStatus is adjudicated
  // - policy required: both technical satisfied AND policy satisfied
  function isFullyAdjudicated(r: (typeof records)[0]): boolean {
    if (r.policyDocRequired) {
      return r.technicalStatus === "satisfied" && r.policyStatus === "satisfied";
    }
    return ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number]);
  }

  const adjudicatedCount = records.filter(isFullyAdjudicated).length;
  const implementedCount = records.filter((r) =>
    IMPLEMENTED_STATUSES.includes(r.implementationStatus as (typeof IMPLEMENTED_STATUSES)[number])
  ).length;
  const outstandingCount = Math.max(0, TOTAL_CONTROLS - adjudicatedCount);
  const implementedPct = TOTAL_CONTROLS ? Math.round((adjudicatedCount / TOTAL_CONTROLS) * 100) : 0;

  // Controls needing review (not_started or in_progress)
  const needingReview = records.filter(
    (r) => r.implementationStatus === "not_started" || r.implementationStatus === "in_progress"
  ).length;

  // ── NIST family breakdown (in-memory, no extra query) ──
  const familyStats = NIST_FAMILIES.map((f) => {
    const familyIds = ALL_CONTROL_IDS.filter((id) => id.startsWith(f.code + "."));
    const total = familyIds.length;
    const done = records.filter(
      (r) => familyIds.includes(r.controlId) && isFullyAdjudicated(r)
    ).length;
    return { ...f, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  });

  // ── POA&M (legacy model for KPI count) ──
  const openPoam = await db
    .select({ status: poamItems.status })
    .from(poamItems)
    .where(eq(poamItems.organizationId, orgId));
  const openPoamCount = openPoam.filter((p) => p.status !== "Closed").length;

  // ── POA&M new model — check milestone coverage for readiness score ──
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

  // Legacy evidence expiry
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

  // ── SPRS ──
  const { getSprsScore } = await import("@/lib/sprs");
  const sprsScore = await getSprsScore(orgId);
  const sprsLabel =
    sprsScore >= 88 ? "Strong" : sprsScore >= 70 ? "Moderate" : sprsScore >= 0 ? "At risk" : "Critical";

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

  // ── Assessment readiness score ──
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
    { label: "Boundary scoping complete", points: 20, earned: boundaryComplete },
    { label: "SSP has ≥3 authored sections", points: 20, earned: sspHasContent },
    { label: "≥80% controls implemented", points: 30, earned: controlsAt80pct },
    { label: "All open POA&Ms have milestones", points: 15, earned: poamHasMilestones },
    { label: "No evidence expiring within 30 days", points: 15, earned: noExpiredEvidence },
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
    nextActions.push({ label: `Author SSP sections (${authoredSections}/3 minimum)`, href: "/dashboard/documents" });

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
        <DashboardSetupWidget onboardingStarted={onboardingStarted} />

        {primeCount > 0 && <FlowDownBanner primeCount={primeCount} />}

        {/* ── Hero row: Adjudication progress + Readiness ring ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={cardClass}>
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                  Control adjudication
                </h2>
                <p className="mt-1 text-3xl font-bold text-[var(--color-navy-primary)]">
                  {adjudicatedCount}{" "}
                  <span className="font-normal text-[var(--color-gray-600)]">/ {TOTAL_CONTROLS}</span>{" "}
                  adjudicated
                </p>
                <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                  {outstandingCount} outstanding · {implementedPct}% implemented or inherited
                </p>
              </div>
              <Link
                href="/dashboard/controls"
                className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
              >
                <Shield className="h-4 w-4" aria-hidden />
                Open SCTM
              </Link>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Assessment Readiness Score</h2>
            <div className="mt-3 flex items-center gap-5">
              <ReadinessRing score={readinessScore} />
              <div className="flex-1 space-y-1.5">
                {readinessBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`h-3.5 w-3.5 shrink-0 rounded-full flex items-center justify-center ${
                      item.earned ? "bg-emerald-100" : "bg-[var(--color-gray-100)]"
                    }`}>
                      {item.earned ? (
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gray-300)]" />
                      )}
                    </div>
                    <span className="flex-1 text-[11px] text-[var(--color-gray-600)]">{item.label}</span>
                    <span className={`text-[11px] font-semibold ${item.earned ? readinessColor : "text-[var(--color-gray-400)]"}`}>
                      {item.earned ? `+${item.points}` : `+0`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ── KPI grid ── */}
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
            <p className={`mt-1 text-2xl font-semibold ${totalExpiring > 0 ? "text-amber-600" : "text-[var(--color-navy-primary)]"}`}>{totalExpiring}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Boundary scoping</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${boundaryComplete ? "bg-emerald-400" : "bg-amber-400"}`} />
              <p className={`text-sm font-semibold ${boundaryComplete ? "text-emerald-700" : "text-amber-700"}`}>
                {boundaryComplete ? "Complete" : "Incomplete"}
              </p>
            </div>
            {!boundaryComplete && (
              <Link href="/dashboard/boundary" className="mt-1 block text-xs text-[var(--color-blue-accent)] hover:underline">
                Complete now →
              </Link>
            )}
          </div>
        </div>

        {/* ── Middle row: NIST family breakdown + Next actions ── */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* NIST family breakdown */}
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

          {/* Next Actions */}
          <section className={`${cardClass} lg:col-span-2`}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Next Actions</h2>
            {nextActions.length === 0 ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                All assessment readiness criteria met.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {nextActions.map((action, i) => (
                  <li key={i}>
                    <Link
                      href={action.href}
                      className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-xs font-medium text-[var(--color-gray-700)] transition-colors hover:border-[var(--color-blue-accent)]/40 hover:bg-[var(--color-gray-50)]"
                    >
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${action.urgent ? "bg-red-400" : "bg-[var(--color-gray-300)]"}`} />
                      <span className="flex-1 leading-snug">{action.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-gray-400)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 rounded-lg bg-[var(--color-gray-50)] px-3 py-2.5">
              <p className="text-xs text-[var(--color-gray-500)]">
                SPRS score:{" "}
                <span className="font-semibold text-[var(--color-gray-800)]">{sprsScore}</span>{" "}
                <span className={`${sprsScore >= 88 ? "text-emerald-600" : sprsScore >= 70 ? "text-amber-600" : "text-red-600"}`}>
                  ({sprsLabel})
                </span>
              </p>
            </div>
          </section>
        </div>

        {/* ── Documents CTA ── */}
        <section className={cardClass}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Governance documents</h2>
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

        {/* ── Bottom row: Recent activity + Org + Export ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className={cardClass}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Recent activity</h2>
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
              <p className="mt-2 text-sm text-[var(--color-gray-500)]">Complete profile in Settings</p>
            )}
          </div>
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Export</h2>
            <div className="mt-3">
              <ExportButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
