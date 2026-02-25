import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import {
  subcontractorRelationships,
  contracts,
  flowdownRequirements,
  controls,
  organizations,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const orgId = await requireOrg();

    // Find all relationships where this org is a subcontractor
    const relationships = await db
      .select({
        relationshipId: subcontractorRelationships.id,
        primeOrganization: {
          id: organizations.id,
          name: organizations.name,
        },
        contract: {
          id: contracts.id,
          contractName: contracts.contractName,
          contractNumber: contracts.contractNumber,
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

    // For each contract, fetch flow-down requirements
    const flowdowns = await Promise.all(
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
            contractName: rel.contract!.contractName,
            contractNumber: rel.contract!.contractNumber,
            controls: requirements,
          };
        })
    );

    return NextResponse.json({ flowdowns });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
