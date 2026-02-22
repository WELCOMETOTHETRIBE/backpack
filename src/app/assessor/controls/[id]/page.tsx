import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  controlImplementations,
  controls,
  controlFamilies,
  evidenceMetadata,
  evidenceControlLinks,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function AssessorControlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId || user?.role !== "Assessor") notFound();
  const { id } = await params;

  const [impl] = await db
    .select({
      id: controlImplementations.id,
      status: controlImplementations.status,
      implementationNarrative: controlImplementations.implementationNarrative,
      policySopRefs: controlImplementations.policySopRefs,
      control: {
        controlId: controls.controlId,
        nistReqId: controls.nistReqId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        familyCode: controlFamilies.code,
      },
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(
      and(
        eq(controlImplementations.id, id),
        eq(controlImplementations.organizationId, orgId)
      )
    );

  if (!impl) notFound();

  const links = await db
    .select({
      evidenceId: evidenceMetadata.evidenceId,
      runId: evidenceMetadata.runId,
      artifactFilename: evidenceMetadata.artifactFilename,
      storageLocation: evidenceMetadata.storageLocation,
      sha256Hash: evidenceMetadata.sha256Hash,
      regenerationInstructions: evidenceMetadata.regenerationInstructions,
    })
    .from(evidenceControlLinks)
    .innerJoin(evidenceMetadata, eq(evidenceControlLinks.evidenceMetadataId, evidenceMetadata.id))
    .where(
      and(
        eq(evidenceControlLinks.controlImplementationId, id),
        eq(evidenceMetadata.organizationId, orgId)
      )
    );

  return (
    <div>
      <Link href="/assessor" className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Back to Assessor view
      </Link>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">
        {impl.control?.controlId} — {impl.control?.title}
      </h1>
      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Implementation narrative</h2>
          <p className="text-sm text-zinc-600">{impl.implementationNarrative ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Linked evidence (metadata)</h2>
          <ul className="space-y-2 text-sm text-zinc-600">
            {links.length === 0 ? (
              <li>None.</li>
            ) : (
              links.map((e) => (
                <li key={e.evidenceId} className="rounded border border-zinc-100 p-2">
                  <span className="font-mono">{e.evidenceId}</span> | RunId: {e.runId} |{" "}
                  {e.artifactFilename} | Location: {e.storageLocation}
                  {e.sha256Hash && ` | SHA-256: ${e.sha256Hash.slice(0, 16)}…`}
                  {e.regenerationInstructions && (
                    <p className="mt-1 text-zinc-500">Regeneration: {e.regenerationInstructions}</p>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
