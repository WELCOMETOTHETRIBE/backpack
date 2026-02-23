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
  poamItems,
  evidenceMetadata,
  auditLogs,
  users,
  subcontractorRelationships,
  boundaryProfiles,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as { role?: string; email?: string; organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

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
    .select({ id: boundaryProfiles.id })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, orgId))
    .limit(1);
  const onboardingStarted = Boolean(boundaryRow) || total > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Dashboard</h1>
          <p className="mt-2 text-gray-600">Welcome back, {user?.email}</p>
        </div>
        <Link
          href="/dashboard/onboarding"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2563EB]"
        >
          {onboardingStarted ? "Continue onboarding" : "Begin onboarding"}
        </Link>
      </div>

      {/* Flow-Down Banner for Subcontractors */}
      {primeCount > 0 && <FlowDownBanner primeCount={primeCount} />}

      {/* Compliance Score Gauge */}
      <div className="flex justify-center rounded-lg border border-gray-200 bg-white p-8">
        <ComplianceScoreGauge score={compliancePct} size={240} />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Open POA&Ms</p>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">{openPoamCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Controls Needing Review</p>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">{controlsNeedingReview}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Evidence Expiring in 30 Days</p>
          <p className="mt-2 text-3xl font-bold text-[#0F172A]">{expiringSoon}</p>
        </div>
      </div>

      {/* SPRS Score — prominent with color band and family breakdown */}
      <div className={`rounded-xl border border-gray-200 p-8 ${sprsBand.bg}`}>
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
      <div className="grid gap-6 lg:grid-cols-2">
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

      {/* Governance Wizard CTA */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <Link
          href="/dashboard/governance-wizard"
          className="inline-flex items-center gap-2 rounded-md bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e293b]"
        >
          Continue Governance Wizard
        </Link>
      </div>

      {/* Export Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ExportButton />
      </div>
    </div>
  );
}
