import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  controlImplementations,
  controls,
  controlFamilies,
  poamItems,
  evidenceMetadata,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import ReportCard from "./ReportCard";

export default async function ReportingPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Fetch data for reports
  const impls = await db
    .select({
      status: controlImplementations.status,
      familyCode: controlFamilies.code,
      familyName: controlFamilies.name,
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(controlImplementations.organizationId, orgId));

  const openPoams = await db
    .select()
    .from(poamItems)
    .where(
      and(
        eq(poamItems.organizationId, orgId),
        eq(poamItems.status, "Open")
      )
    )
    .orderBy(desc(poamItems.targetCompletionDate));

  const evidence = await db
    .select()
    .from(evidenceMetadata)
    .where(eq(evidenceMetadata.organizationId, orgId));

  const in60Days = new Date();
  in60Days.setDate(in60Days.getDate() + 60);
  const expiringEvidence = evidence.filter(
    (e) => e.retentionUntil && new Date(e.retentionUntil) <= in60Days
  );

  // Calculate family breakdown
  const familyBreakdown = impls.reduce(
    (acc, impl) => {
      const code = impl.familyCode || "Unknown";
      if (!acc[code]) {
        acc[code] = { code, name: impl.familyName || code, total: 0, implemented: 0 };
      }
      acc[code].total++;
      if (impl.status === "Implemented") {
        acc[code].implemented++;
      }
      return acc;
    },
    {} as Record<string, { code: string; name: string; total: number; implemented: number }>
  );

  const total = impls.length;
  const implemented = impls.filter((i) => i.status === "Implemented").length;
  const compliancePct = total > 0 ? Math.round((implemented / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Reporting</h1>
        <p className="mt-2 text-gray-600">
          Generate professional compliance reports for stakeholders and audits
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ReportCard
          title="Executive Compliance Summary"
          description="One-page PDF suitable for board presentation"
          reportType="executive"
          data={{
            compliancePct,
            total,
            implemented,
            openPoams: openPoams.length,
            expiringEvidence: expiringEvidence.length,
          }}
        />
        <ReportCard
          title="POA&M Aging Report"
          description="All open items sorted by days overdue"
          reportType="poam-aging"
          data={{ poams: openPoams }}
        />
        <ReportCard
          title="Evidence Expiration Report"
          description="All evidence items expiring within 60 days"
          reportType="evidence-expiration"
          data={{ evidence: expiringEvidence }}
        />
        <ReportCard
          title="Control Family Breakdown"
          description="Implementation percentage by NIST family"
          reportType="family-breakdown"
          data={{ families: Object.values(familyBreakdown) }}
        />
      </div>
    </div>
  );
}
