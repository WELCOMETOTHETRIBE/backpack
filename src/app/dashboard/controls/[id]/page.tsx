import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  controlImplementations,
  controls,
  controlFamilies,
  controlHistory,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import ControlDetailForm from "./ControlDetailForm";

export default async function ControlDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) notFound();
  const { id } = await params;

  const [impl] = await db
    .select({
      id: controlImplementations.id,
      status: controlImplementations.status,
      implementationNarrative: controlImplementations.implementationNarrative,
      monitoringCadence: controlImplementations.monitoringCadence,
      lastValidationDate: controlImplementations.lastValidationDate,
      policySopRefs: controlImplementations.policySopRefs,
      control: {
        controlId: controls.controlId,
        nistReqId: controls.nistReqId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        familyCode: controlFamilies.code,
        codexMetadata: controls.codexMetadata,
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

  const history = await db
    .select({
      id: controlHistory.id,
      fieldName: controlHistory.fieldName,
      oldValue: controlHistory.oldValue,
      newValue: controlHistory.newValue,
      createdAt: controlHistory.createdAt,
      changedByEmail: users.email,
    })
    .from(controlHistory)
    .leftJoin(users, eq(controlHistory.changedById, users.id))
    .where(eq(controlHistory.controlImplementationId, id))
    .orderBy(desc(controlHistory.createdAt));

  const codex = impl.control?.codexMetadata as {
    classification?: string;
    pilot_status?: string;
    pilot_status_basis?: string;
    evidence?: { artifact_name?: string; location?: string; regeneration_method?: string };
    policy_sop_refs?: string;
    implementation_summary?: string;
  } | null;

  return (
    <div>
      <Link href="/dashboard/controls" className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Back to Controls
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {impl.control?.controlId} — {impl.control?.title}
        </h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">NIST requirement (exact text)</h2>
          <p className="text-sm text-zinc-600">{impl.control?.nistExactText ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <ControlDetailForm
            implementationId={id}
            initialStatus={impl.status}
            initialNarrative={impl.implementationNarrative}
            initialCadence={impl.monitoringCadence}
            initialLastValidation={impl.lastValidationDate ? new Date(impl.lastValidationDate).toISOString().slice(0, 10) : null}
            initialPolicySopRefs={impl.policySopRefs}
          />
        </div>
      </div>
      {codex && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Auditor manual — evidence &amp; closeout</h2>
          <p className="mb-3 text-sm text-zinc-500">Single source for this control: status basis, evidence location, regeneration, NIST text.</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-1">
            {codex.classification && (
              <>
                <dt className="font-medium text-zinc-700">Classification</dt>
                <dd className="text-zinc-600">{codex.classification}</dd>
              </>
            )}
            {codex.pilot_status_basis && (
              <>
                <dt className="font-medium text-zinc-700">Status basis</dt>
                <dd className="text-zinc-600">{codex.pilot_status_basis}</dd>
              </>
            )}
            {codex.evidence?.artifact_name && (
              <>
                <dt className="font-medium text-zinc-700">Evidence artifact</dt>
                <dd className="text-zinc-600">{codex.evidence.artifact_name}</dd>
              </>
            )}
            {codex.evidence?.location && (
              <>
                <dt className="font-medium text-zinc-700">Evidence location (VM)</dt>
                <dd className="font-mono text-zinc-600">{codex.evidence.location}</dd>
              </>
            )}
            {codex.evidence?.regeneration_method && (
              <>
                <dt className="font-medium text-zinc-700">Regeneration</dt>
                <dd className="text-zinc-600">{codex.evidence.regeneration_method}</dd>
              </>
            )}
            {codex.policy_sop_refs && (
              <>
                <dt className="font-medium text-zinc-700">Policy / SOP refs</dt>
                <dd className="text-zinc-600">{codex.policy_sop_refs}</dd>
              </>
            )}
            {codex.implementation_summary && (
              <>
                <dt className="font-medium text-zinc-700">Implementation summary</dt>
                <dd className="text-zinc-600">{codex.implementation_summary}</dd>
              </>
            )}
          </dl>
        </div>
      )}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-zinc-800">History</h2>
        <ul className="space-y-2 text-sm">
          {history.length === 0 ? (
            <li className="text-zinc-500">No changes yet.</li>
          ) : (
            history.map((h) => (
              <li key={h.id} className="flex gap-2 text-zinc-600">
                <span className="font-mono">{h.fieldName}</span>
                <span>{h.oldValue ?? "—"} → {h.newValue ?? "—"}</span>
                <span>{h.changedByEmail ?? "—"}</span>
                <span>{new Date(h.createdAt).toLocaleString()}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
