import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import ExportButton from "@/components/ExportButton";
import ComplianceScoreGauge from "@/components/ComplianceScoreGauge";
import ControlFamilyHeatMap from "@/components/ControlFamilyHeatMap";
import ActivityTimeline from "@/components/ActivityTimeline";
import FlowDownBanner from "@/components/FlowDownBanner";
import {
  controlImplementations,
  controls,
  controlFamilies,
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ skip_onboarding?: string }>;
}) {
  const session = await auth();
  const user = session?.user as { role?: string; email?: string; organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");
  const params = await searchParams;

  // Fetch control implementations with family data
  const implsWithControl = await db
    .select({
      status: controlImplementations.status,
      controlId: controls.controlId,
      familyCode: controlFamilies.code,
      familyName: controlFamilies.name,
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(controlImplementations.organizationId, orgId));

  const total = implsWithControl.length;
  const implemented = implsWithControl.filter((i) => i.status === "Implemented").length;
  const compliancePct = total > 0 ? Math.round((implemented / total) * 100) : 0;

  // Calculate family-level stats
  const familyStats = implsWithControl.reduce(
    (acc, impl) => {
      const code = impl.familyCode || "Unknown";
      if (!acc[code]) {
        acc[code] = { code, name: impl.familyName || code, implemented: 0, total: 0 };
      }
      acc[code].total++;
      if (impl.status === "Implemented") {
        acc[code].implemented++;
      }
      return acc;
    },
    {} as Record<string, { code: string; name: string; implemented: number; total: number }>
  );

  // Fetch POA&M stats
  const openPoam = await db
    .select()
    .from(poamItems)
    .where(eq(poamItems.organizationId, orgId));
  const openPoamCount = openPoam.filter((p) => p.status !== "Closed").length;
  const controlsNeedingReview = implsWithControl.filter(
    (i) => i.status === "Partial" || i.status === "POA&M"
  ).length;

  // Fetch evidence expiration stats
  const evidence = await db
    .select({ retentionUntil: evidenceMetadata.retentionUntil })
    .from(evidenceMetadata)
    .where(eq(evidenceMetadata.organizationId, orgId));
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringSoon = evidence.filter(
    (e) => e.retentionUntil && new Date(e.retentionUntil) <= in30Days
  ).length;

  // SPRS score (persisted) and breakdown by family
  const { getSprsScore, getSprsBreakdown } = await import("@/lib/sprs");
  const [sprsScore, sprsBreakdown] = await Promise.all([
    getSprsScore(orgId),
    getSprsBreakdown(orgId),
  ]);

  const sprsBand =
    sprsScore >= 88
      ? { label: "Strong Posture", color: "text-green-600", bg: "bg-green-50" }
      : sprsScore >= 70
        ? { label: "Moderate Posture", color: "text-yellow-700", bg: "bg-yellow-50" }
        : sprsScore >= 0
          ? { label: "At Risk", color: "text-orange-700", bg: "bg-orange-50" }
          : { label: "Critical Gaps", color: "text-red-700", bg: "bg-red-50" };

  // Fetch recent activity
  const recentActivity = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.organizationId, orgId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  // Check if this org is a subcontractor with active flow-down requirements
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

  // Onboarding: has org started (boundary profile or control records)?
  const [boundaryRow] = await db
    .select({ id: boundaryProfiles.id, selectedTechnologies: boundaryProfiles.selectedTechnologies })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, orgId))
    .limit(1);
  const controlRecordsCount = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId))
    .limit(1);
  const onboardingStarted = Boolean(boundaryRow) || total > 0 || controlRecordsCount.length > 0;
  if (!onboardingStarted && params?.skip_onboarding !== "1") redirect("/welcome");

  // Org profile and SSP snippets for dashboard summary
  const [orgRow] = await db
    .select({
      name: organizations.name,
      cageCode: organizations.cageCode,
      primaryAddress: organizations.primaryAddress,
      primaryContactName: organizations.primaryContactName,
      primaryContactEmail: organizations.primaryContactEmail,
      organizationType: organizations.organizationType,
      cmmcTargetLevel: organizations.cmmcTargetLevel,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const sspRows = await db
    .select({ sectionKey: sspSections.sectionKey, content: sspSections.content })
    .from(sspSections)
    .where(eq(sspSections.organizationId, orgId));
  const systemDescription = sspRows.find((r) => r.sectionKey === "system_description")?.content ?? "";
  const cuiBoundary = sspRows.find((r) => r.sectionKey === "cui_boundary")?.content ?? "";

  const techLabelsMap: Record<string, string> = {};
  for (const group of BOUNDARY_TECHNOLOGY_OPTIONS) {
    for (const opt of group.options) techLabelsMap[opt.value] = opt.label;
  }
  const selectedTechLabels = (boundaryRow?.selectedTechnologies ?? []).map((v: string) => techLabelsMap[v] ?? v);

  const showProfileCard =
    orgRow?.organizationType ||
    orgRow?.cmmcTargetLevel ||
    orgRow?.cageCode ||
    orgRow?.primaryAddress ||
    orgRow?.primaryContactName ||
    orgRow?.primaryContactEmail ||
    systemDescription ||
    cuiBoundary ||
    selectedTechLabels.length > 0;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">Dashboard</h1>
          <p className="mt-1.5 text-[15px] text-slate-600">Welcome back, {user?.email}</p>
        </div>
        <Link
          href="/welcome"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          {onboardingStarted ? "Edit setup" : "Begin setup"}
        </Link>
      </div>

      {/* Flow-Down Banner for Subcontractors */}
      {primeCount > 0 && <FlowDownBanner primeCount={primeCount} />}

      {/* Organization profile from onboarding */}
      {showProfileCard && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] sm:p-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Organization profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {orgRow?.cageCode && (
              <div>
                <p className="text-sm font-medium text-gray-500">CAGE Code</p>
                <p className="mt-0.5 text-gray-900">{orgRow.cageCode}</p>
              </div>
            )}
            {orgRow?.primaryAddress && (
              <div>
                <p className="text-sm font-medium text-gray-500">Primary address</p>
                <p className="mt-0.5 text-gray-900">{orgRow.primaryAddress}</p>
              </div>
            )}
            {(orgRow?.primaryContactName || orgRow?.primaryContactEmail) && (
              <div>
                <p className="text-sm font-medium text-gray-500">Primary point of contact</p>
                <p className="mt-0.5 text-gray-900">
                  {[orgRow.primaryContactName, orgRow.primaryContactEmail].filter(Boolean).join(" — ")}
                </p>
              </div>
            )}
            {orgRow?.organizationType && (
              <div>
                <p className="text-sm font-medium text-gray-500">Organization type</p>
                <p className="mt-0.5 text-gray-900">
                  {orgRow.organizationType === "prime"
                    ? "Prime Contractor"
                    : orgRow.organizationType === "sub"
                      ? "Subcontractor"
                      : "Both Prime and Sub"}
                </p>
              </div>
            )}
            {orgRow?.cmmcTargetLevel && (
              <div>
                <p className="text-sm font-medium text-gray-500">CMMC target level</p>
                <p className="mt-0.5 text-gray-900">
                  {orgRow.cmmcTargetLevel === "Level1"
                    ? "Level 1 — Basic"
                    : orgRow.cmmcTargetLevel === "Level2"
                      ? "Level 2 — Intermediate"
                      : orgRow.cmmcTargetLevel === "Level3"
                        ? "Level 3 — Advanced"
                        : orgRow.cmmcTargetLevel}
                </p>
              </div>
            )}
          </div>
          {selectedTechLabels.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-500">Technology boundary</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {selectedTechLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(cuiBoundary || systemDescription) && (
            <div className="mt-4 space-y-3">
              {cuiBoundary && (
                <div>
                  <p className="text-sm font-medium text-gray-500">CUI boundary</p>
                  <p className="mt-0.5 line-clamp-3 text-sm text-gray-700">{cuiBoundary}</p>
                </div>
              )}
              {systemDescription && (
                <div>
                  <p className="text-sm font-medium text-gray-500">System scope</p>
                  <p className="mt-0.5 line-clamp-3 text-sm text-gray-700">{systemDescription}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compliance Score Gauge */}
      <div className="flex justify-center rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <ComplianceScoreGauge score={compliancePct} size={240} />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <p className="text-[13px] font-medium text-slate-500">Open POA&Ms</p>
          <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{openPoamCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <p className="text-[13px] font-medium text-slate-500">Controls needing review</p>
          <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{controlsNeedingReview}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <p className="text-[13px] font-medium text-slate-500">Evidence expiring in 30 days</p>
          <p className="mt-2 text-2xl font-semibold text-[#0F172A]">{expiringSoon}</p>
        </div>
      </div>

      {/* SPRS Score — prominent with color band and family breakdown */}
      <div className={`rounded-2xl border border-slate-200/80 p-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] ${sprsBand.bg}`}>
        <p className="text-sm font-medium text-gray-600">SPRS Score</p>
        <p className={`mt-2 text-5xl font-bold ${sprsBand.color}`}>{sprsScore}</p>
        <p className={`mt-1 text-lg font-medium ${sprsBand.color}`}>{sprsBand.label}</p>
        {sprsBreakdown.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-700">Points lost by family</p>
            <ul className="mt-2 space-y-1">
              {sprsBreakdown.map(({ family, pointsLost }) => (
                <li key={family} className="flex justify-between text-sm">
                  <span className="text-gray-700">{family}</span>
                  <span className="font-medium text-gray-900">−{pointsLost}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Two-column layout: Activity Timeline and Control Family Heat Map */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityTimeline
          activities={recentActivity.map((a) => ({
            id: a.id,
            action: a.action,
            resourceType: a.resourceType,
            createdAt: a.createdAt,
            userName: a.userName,
          }))}
        />
        <ControlFamilyHeatMap families={Object.values(familyStats)} />
      </div>

      {/* Compliance hub CTA */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <Link
          href="/dashboard/governance-wizard"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1e293b]"
        >
          Open compliance hub
        </Link>
      </div>

      {/* Export Section */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <ExportButton />
      </div>
      </div>
    </div>
  );
}
