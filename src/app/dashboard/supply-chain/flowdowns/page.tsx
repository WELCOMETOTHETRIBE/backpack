import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  subcontractorRelationships,
  contracts,
  flowdownRequirements,
  controls,
  organizations,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function FlowdownsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Fetch all active relationships where this org is a subcontractor
  const relationships = await db
    .select({
      primeOrganization: {
        id: organizations.id,
        name: organizations.name,
      },
      contract: {
        id: contracts.id,
        contractName: contracts.contractName,
        contractNumber: contracts.contractNumber,
        cmmcLevelRequired: contracts.cmmcLevelRequired,
      },
    })
    .from(subcontractorRelationships)
    .innerJoin(organizations, eq(subcontractorRelationships.primeOrganizationId, organizations.id))
    .leftJoin(
      contracts,
      and(
        eq(contracts.primeOrganizationId, organizations.id),
        eq(contracts.subOrganizationId, orgId)
      )
    )
    .where(
      and(
        eq(subcontractorRelationships.subOrganizationId, orgId),
        eq(subcontractorRelationships.status, "Active")
      )
    );

  // Fetch flow-down requirements for each contract
  const flowdownsWithControls = await Promise.all(
    relationships
      .filter((r) => r.contract?.id)
      .map(async (rel) => {
        const requirements = await db
          .select({
            controlId: controls.controlId,
            controlTitle: controls.title,
          })
          .from(flowdownRequirements)
          .innerJoin(controls, eq(flowdownRequirements.controlId, controls.id))
          .where(eq(flowdownRequirements.contractId, rel.contract!.id));

        return {
          primeName: rel.primeOrganization.name,
          contract: rel.contract!,
          controls: requirements,
        };
      })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Flow-Down Requirements</h1>
        <p className="mt-2 text-gray-600">
          Controls required by your prime contractors. These must be implemented to maintain contract compliance.
        </p>
      </div>

      {flowdownsWithControls.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-600">No active flow-down requirements at this time.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {flowdownsWithControls.map((flowdown, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-[#0F172A]">{flowdown.primeName}</h2>
                <p className="text-sm text-gray-600">
                  Contract: {flowdown.contract.contractName}
                  {flowdown.contract.contractNumber && ` (${flowdown.contract.contractNumber})`}
                </p>
                <p className="text-sm text-gray-600">
                  CMMC Level Required: {flowdown.contract.cmmcLevelRequired}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-medium text-gray-700">
                  Required Controls ({flowdown.controls.length})
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {flowdown.controls.map((control) => (
                    <div
                      key={control.controlId}
                      className="rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-gray-900">{control.controlId}</span>
                      <p className="mt-1 text-xs text-gray-600">{control.controlTitle}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
