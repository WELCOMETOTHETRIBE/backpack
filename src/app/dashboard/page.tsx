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
  evidenceMetadata,
  auditLogs,
  users,
  subcontractorRelationships,
  boundaryProfiles,
  organizations,
  sspSections,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { BOUNDARY_TECHNOLOGY_OPTIONS } from "@/lib/compliance/technical_evidence_requirements";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { Shield, FileStack } from "lucide-react";

const TOTAL_CONTROLS = ALL_CONTROL_IDS.length;
const ADJUDICATED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as { role?: string; organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Adjudication progress from controlRecords (single source of truth)
  const records = await db
    .select({ controlId: controlRecords.controlId, implementationStatus: controlRecords.implementationStatus })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));
  const adjudicatedCount = records.filter((r) =>
    ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number])
  ).length;
  const outstandingCount = Math.max(0, TOTAL_CONTROLS - adjudicatedCount);

  // POA&M
  const openPoam = await db
    .select()
    .from(poamItems)
    .where(eq(poamItems.organizationId, orgId));
  const openPoamCount = openPoam.filter((p) => p.status !== "Closed").length;

  // Controls needing review (not_started or in_progress)
  const needingReview = records.filter(
    (r) => r.implementationStatus === "not_started" || r.implementationStatus === "in_progress"
  ).length;

  // Evidence expiring in 30 days
  const evidence = await db
    .select({ retentionUntil: evidenceMetadata.retentionUntil })
    .from(evidenceMetadata)
    .where(eq(evidenceMetadata.organizationId, orgId));
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringSoon = evidence.filter(
    (e) => e.retentionUntil && new Date(e.retentionUntil) <= in30Days
  ).length;

  // SPRS
  const { getSprsScore } = await import("@/lib/sprs");
  const sprsScore = await getSprsScore(orgId);
  const sprsLabel =
    sprsScore >= 88 ? "Strong" : sprsScore >= 70 ? "Moderate" : sprsScore >= 0 ? "At risk" : "Critical";

  // Recent activity (slim)
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

  // Flow-down
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

  // Onboarding
  const [boundaryRow] = await db
    .select({ id: boundaryProfiles.id })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, orgId))
    .limit(1);
  const onboardingStarted = Boolean(boundaryRow) || records.length > 0;

  // Org profile (slim)
  const [orgRow] = await db
    .select({
      name: organizations.name,
      cageCode: organizations.cageCode,
      cmmcTargetLevel: organizations.cmmcTargetLevel,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
        <DashboardSetupWidget onboardingStarted={onboardingStarted} />

        {primeCount > 0 && <FlowDownBanner primeCount={primeCount} />}

        {/* Hero: Adjudication progress + primary CTA */}
        <section className={cardClass}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                Control adjudication
              </h2>
              <p className="mt-1 text-3xl font-bold text-[var(--color-navy-primary)]">
                {adjudicatedCount} <span className="font-normal text-[var(--color-gray-600)]">/ {TOTAL_CONTROLS}</span>{" "}
                controls adjudicated
              </p>
              <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                {outstandingCount} outstanding. Use the SCTM to adjudicate and attach evidence.
              </p>
            </div>
            <Link
              href="/dashboard/controls"
              className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Shield className="h-4 w-4" aria-hidden />
              Open SCTM
            </Link>
          </div>
        </section>

        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Open POA&Ms</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">{openPoamCount}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Controls needing review</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">{needingReview}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Evidence expiring in 30 days</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">{expiringSoon}</p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">SPRS score</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">
              {sprsScore} <span className="text-sm font-normal text-[var(--color-gray-600)]">({sprsLabel})</span>
            </p>
          </div>
        </div>

        {/* Documents CTA */}
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

        {/* Bottom row: Recent activity + Org profile + Export */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Recent activity</h2>
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
