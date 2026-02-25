import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  subcontractorFlowdownResponses,
  subcontractorRelationships,
  organizations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import SubcontractorResponseClient from "./SubcontractorResponseClient";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SubcontractorResponsePage({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length !== 64) notFound();

  const [row] = await db
    .select({
      id: subcontractorFlowdownResponses.id,
      responseType: subcontractorFlowdownResponses.responseType,
      respondedAt: subcontractorFlowdownResponses.respondedAt,
      primeName: organizations.name,
    })
    .from(subcontractorFlowdownResponses)
    .innerJoin(
      subcontractorRelationships,
      eq(subcontractorFlowdownResponses.subcontractorRelationshipId, subcontractorRelationships.id)
    )
    .innerJoin(
      organizations,
      eq(subcontractorRelationships.primeOrganizationId, organizations.id)
    )
    .where(eq(subcontractorFlowdownResponses.token, token))
    .limit(1);

  if (!row) notFound();
  if (row.respondedAt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Link already used</h1>
        <p className="mt-2 text-gray-600">
          This flow-down response link has already been used. If you need to update your response, please contact your prime contractor.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">Flow-down response</h1>
      <p className="mt-2 text-gray-600">
        <strong>{row.primeName}</strong> has requested that you respond to their CMMC flow-down requirements.
      </p>
      <SubcontractorResponseClient token={token} primeName={row.primeName ?? "Prime contractor"} />
    </div>
  );
}
