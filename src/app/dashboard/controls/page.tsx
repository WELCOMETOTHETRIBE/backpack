import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { controlImplementations, controls, controlFamilies, flowdownRequirements, contracts } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import ControlsFilter from "./ControlsFilter";
import ControlsList from "./ControlsList";

export default async function ControlsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const impls = await db
    .select({
      id: controlImplementations.id,
      status: controlImplementations.status,
      control: {
        controlId: controls.controlId,
        title: controls.title,
        familyCode: controlFamilies.code,
        controlUuid: controls.id,
      },
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(controlImplementations.organizationId, orgId));

  // Fetch flow-down requirements for this subcontractor
  const subContracts = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.subOrganizationId, orgId));

  const contractIds = subContracts.map((c) => c.id);
  let flowdownControlUuids: string[] = [];

  if (contractIds.length > 0) {
    const flowdowns = await db
      .select({ controlId: flowdownRequirements.controlId })
      .from(flowdownRequirements)
      .where(inArray(flowdownRequirements.contractId, contractIds));

    flowdownControlUuids = flowdowns.map((f) => f.controlId);
  }

  const byFamily = impls.reduce(
    (acc: Record<string, typeof impls>, c) => {
      const code = c.control?.familyCode ?? "Other";
      if (!acc[code]) acc[code] = [];
      acc[code].push(c);
      return acc;
    },
    {}
  );

  const familyOrder = ["AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP", "PE", "PL", "PS", "RA", "SA", "SC", "SI"];

  // Calculate tallies
  const GOVERNANCE_FAMILIES = ["PL", "PS", "RA"];
  const technicalCount = impls.filter(
    (c) =>
      !GOVERNANCE_FAMILIES.includes(c.control?.familyCode || "") &&
      c.status !== "Inherited" &&
      c.status !== "Not Applicable"
  ).length;
  const governanceCount = impls.filter((c) =>
    GOVERNANCE_FAMILIES.includes(c.control?.familyCode || "")
  ).length;
  const inheritedCount = impls.filter((c) => c.status === "Inherited").length;
  const naCount = impls.filter((c) => c.status === "Not Applicable").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold text-[#0F172A]">Controls</h1>
        <p className="text-gray-600">
          NIST SP 800-171 Rev 2 — 110 controls. Click a control to view or edit implementation.
        </p>
      </div>
      
      <Suspense fallback={<div className="mb-6 h-12 animate-pulse rounded-lg bg-gray-100" />}>
        <ControlsFilter
          totalCount={impls.length}
          technicalCount={technicalCount}
          governanceCount={governanceCount}
          inheritedCount={inheritedCount}
          naCount={naCount}
        />
      </Suspense>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-gray-100" />}>
        <ControlsList
          impls={impls}
          byFamily={byFamily}
          familyOrder={familyOrder}
          flowdownControlUuids={flowdownControlUuids}
        />
      </Suspense>
    </div>
  );
}
