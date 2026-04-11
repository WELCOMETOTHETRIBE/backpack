import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { controlRecords, technicalEvidence, controls } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { technicalEvidenceRequirements } from "@/lib/compliance/technical_evidence_requirements";
import { HYBRID_GOVERNANCE_IDS } from "@/lib/compliance/control-bins";
import Link from "next/link";
import EvidenceSubmitClient from "./EvidenceSubmitClient";

export default async function HybridEvidencePage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;

  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Only hybrid governance controls land here
  if (!HYBRID_GOVERNANCE_IDS.includes(controlId)) {
    redirect("/dashboard/governance");
  }

  const [controlRecord] = await db
    .select({
      id: controlRecords.id,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
    })
    .from(controlRecords)
    .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, controlId)))
    .limit(1);

  const [controlMeta] = await db
    .select({ title: controls.title, nistExactText: controls.nistExactText })
    .from(controls)
    .where(eq(controls.controlId, controlId))
    .limit(1);

  // All existing technical evidence submissions for this control record
  const existingEvidence = controlRecord
    ? await db
        .select({
          id: technicalEvidence.id,
          requirementId: technicalEvidence.requirementId,
          evidenceType: technicalEvidence.evidenceType,
          description: technicalEvidence.description,
          fileUrl: technicalEvidence.fileUrl,
          sourceUrl: technicalEvidence.sourceUrl,
          createdAt: technicalEvidence.createdAt,
        })
        .from(technicalEvidence)
        .where(eq(technicalEvidence.controlRecordId, controlRecord.id))
    : [];

  // Get requirements for this control (all variants — user will submit what applies)
  const reqEntry = technicalEvidenceRequirements.find((e) => e.controlId === controlId);
  const allRequirements = reqEntry
    ? Object.values(reqEntry.variants).flat().filter(
        (req, idx, arr) => arr.findIndex((r) => r.id === req.id) === idx
      )
    : [];

  const satisfiedIds = new Set(existingEvidence.map((e) => e.requirementId).filter(Boolean));
  const controlRecordId = controlRecord?.id ?? null;
  const technicalStatus = controlRecord?.technicalStatus ?? "not_started";
  const implementationStatus = controlRecord?.implementationStatus ?? "not_started";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/governance"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Governance Coverage
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            <span className="font-mono text-blue-600 dark:text-blue-400">{controlId}</span>
            {" — "}
            {controlMeta?.title ?? "Technical Evidence"}
          </h1>
          {technicalStatus === "satisfied" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              Technical lane satisfied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Technical lane pending
            </span>
          )}
        </div>
        {controlMeta?.nistExactText && (
          <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400 italic">
            &ldquo;{controlMeta.nistExactText}&rdquo;
          </p>
        )}
      </div>

      {allRequirements.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            No specific evidence requirements defined for this control.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            This control has no technical evidence requirements — its technical lane satisfies automatically.
            If it still shows pending, click the Recalculate button on the Governance page.
          </p>
        </div>
      ) : (
        <EvidenceSubmitClient
          controlId={controlId}
          controlRecordId={controlRecordId}
          requirements={allRequirements}
          existingEvidence={existingEvidence.map((e) => ({
            id: e.id,
            requirementId: e.requirementId ?? null,
            evidenceType: e.evidenceType,
            description: e.description ?? null,
            fileUrl: e.fileUrl ?? null,
            sourceUrl: e.sourceUrl ?? null,
            createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
          }))}
          satisfiedIds={[...satisfiedIds]}
          technicalStatus={technicalStatus}
          implementationStatus={implementationStatus}
        />
      )}
    </div>
  );
}
