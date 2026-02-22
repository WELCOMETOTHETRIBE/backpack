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
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

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

  // Calculate SPRS score
  const { calculateSprsScore } = await import("@/lib/sprs");
  const sprsScore = await calculateSprsScore(orgId);

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Dashboard</h1>
        <p className="mt-2 text-gray-600">Welcome back, {user?.email}</p>
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
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Live SPRS Score</p>
          <p className="mt-2 text-3xl font-bold text-[#3B82F6]">{sprsScore}</p>
        </div>
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

      {/* Export Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ExportButton />
      </div>
    </div>
  );
}
