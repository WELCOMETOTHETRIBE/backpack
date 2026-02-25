import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  subcontractorRelationships,
  contracts,
  organizations,
  flowdownRequirements,
  controls,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import InviteSubcontractorButton from "./InviteSubcontractorButton";
import SubcontractorTable from "./SubcontractorTable";

export default async function SupplyChainPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Fetch all subcontractor relationships where this org is the prime
  const relationships = await db
    .select({
      id: subcontractorRelationships.id,
      status: subcontractorRelationships.status,
      inviteEmail: subcontractorRelationships.inviteEmail,
      subOrganization: {
        id: organizations.id,
        name: organizations.name,
      },
    })
    .from(subcontractorRelationships)
    .leftJoin(organizations, eq(subcontractorRelationships.subOrganizationId, organizations.id))
    .where(eq(subcontractorRelationships.primeOrganizationId, orgId));

  // Fetch contracts for each relationship
  const contractsData = await db
    .select({
      id: contracts.id,
      contractName: contracts.contractName,
      contractNumber: contracts.contractNumber,
      cmmcLevelRequired: contracts.cmmcLevelRequired,
      subOrganizationId: contracts.subOrganizationId,
    })
    .from(contracts)
    .where(eq(contracts.primeOrganizationId, orgId));

  // For each subcontractor, fetch their compliance status (via secure API)
  const subcontractorsWithStatus = await Promise.all(
    relationships.map(async (rel) => {
      const contract = contractsData.find((c) => c.subOrganizationId === rel.subOrganization?.id);
      return {
        ...rel,
        contract,
        // Status will be fetched client-side via the secure API
      };
    })
  );

  const cardClass = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Supply Chain</h1>
          <p className="mt-2 text-gray-600">Manage subcontractor relationships and flow-down requirements.</p>
        </div>
        <InviteSubcontractorButton />
      </div>

      <div className={cardClass}>
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Subcontractors</h2>
        <SubcontractorTable subcontractors={subcontractorsWithStatus} />
      </div>
    </div>
  );
}
