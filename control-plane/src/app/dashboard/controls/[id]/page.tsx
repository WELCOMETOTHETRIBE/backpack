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
        nistDiscussionGuidance: controls.nistDiscussionGuidance,
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

  return (
    <div>
      <Link href="/dashboard/controls" className="mb-4 inline-block text-sm text-gray-600 hover:text-gray-900">
        ← Back to Controls
      </Link>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-[#3B82F6]/10 px-2 py-1 text-xs font-semibold text-[#3B82F6]">
            {impl.control?.familyCode}
          </span>
          <span className="font-mono text-sm text-gray-500">{impl.control?.controlId}</span>
        </div>
        <h1 className="text-3xl font-bold text-[#0F172A]">
          {impl.control?.title}
        </h1>
        {impl.control?.nistReqId && (
          <p className="mt-1 text-sm text-gray-600">NIST Requirement ID: {impl.control.nistReqId}</p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-[#0F172A]">NIST Requirement</h2>
            <div className="mb-4">
              <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Exact Text</p>
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                {impl.control?.nistExactText ?? "—"}
              </p>
            </div>
            {impl.control?.nistDiscussionGuidance && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Discussion & Guidance</p>
                <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {impl.control.nistDiscussionGuidance}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
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
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Change History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No changes recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="rounded border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-gray-700">{h.fieldName}</span>
                      <span className="text-xs text-gray-500">→</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <span className="text-gray-500 line-through">{h.oldValue ?? "—"}</span>
                      <span className="ml-2 font-medium text-gray-900">{h.newValue ?? "—"}</span>
                    </div>
                  </div>
                  <div className="ml-4 text-right text-xs text-gray-500">
                    <div>{h.changedByEmail ?? "System"}</div>
                    <div>{new Date(h.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
