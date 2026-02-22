import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  poamItems,
  poamMilestones,
  poamClosureApprovals,
  controlImplementations,
  controls,
  users,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import ClosureSignOffButton from "./ClosureSignOffButton";

export default async function PoamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string; id?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) notFound();
  const { id } = await params;

  const [item] = await db
    .select({
      id: poamItems.id,
      poamId: poamItems.poamId,
      title: poamItems.title,
      description: poamItems.description,
      rootCause: poamItems.rootCause,
      riskSeverity: poamItems.riskSeverity,
      status: poamItems.status,
      targetCompletionDate: poamItems.targetCompletionDate,
      evidenceMetadataRef: poamItems.evidenceMetadataRef,
      closedAt: poamItems.closedAt,
      control: { controlId: controls.controlId, title: controls.title },
    })
    .from(poamItems)
    .innerJoin(controlImplementations, eq(poamItems.controlImplementationId, controlImplementations.id))
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .where(and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId)));

  if (!item) notFound();

  const milestones = await db
    .select()
    .from(poamMilestones)
    .where(eq(poamMilestones.poamItemId, id));
  const approvals = await db
    .select({
      approverId: poamClosureApprovals.approverId,
      approvalOrder: poamClosureApprovals.approvalOrder,
      attestedAt: poamClosureApprovals.attestedAt,
      approverEmail: users.email,
    })
    .from(poamClosureApprovals)
    .leftJoin(users, eq(poamClosureApprovals.approverId, users.id))
    .where(eq(poamClosureApprovals.poamItemId, id));

  const canSignOff =
    item.status !== "Closed" &&
    user?.role !== "Assessor" &&
    !approvals.some((a) => a.approverId === user?.id);

  return (
    <div>
      <Link href="/dashboard/poam" className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Back to POA&M
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {item.poamId} — {item.title}
        </h1>
        {canSignOff && <ClosureSignOffButton poamItemId={id} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">Control:</span> {item.control?.controlId} — {item.control?.title}
          </p>
          <p className="mt-2 text-sm text-zinc-600">{item.description ?? "—"}</p>
          <p className="mt-2 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">Root cause:</span> {item.rootCause ?? "—"}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">Risk:</span> {item.riskSeverity ?? "—"}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">Target completion:</span>{" "}
            {item.targetCompletionDate ? new Date(item.targetCompletionDate).toLocaleDateString() : "—"}
          </p>
          {item.evidenceMetadataRef && (
            <p className="mt-2 text-sm text-zinc-600">
              <span className="font-medium text-zinc-800">Evidence ref:</span> {item.evidenceMetadataRef}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Closure approvals (dual sign-off)</h2>
          <ul className="space-y-2 text-sm text-zinc-600">
            {approvals.length === 0 ? (
              <li>No sign-offs yet.</li>
            ) : (
              approvals.map((a) => (
                <li key={a.approvalOrder}>
                  #{a.approvalOrder} {a.approverEmail ?? a.approverId} —{" "}
                  {a.attestedAt ? new Date(a.attestedAt).toLocaleString() : ""}
                </li>
              ))
            )}
          </ul>
          <h2 className="mt-4 mb-2 font-medium text-zinc-800">Milestones</h2>
          <ul className="space-y-1 text-sm text-zinc-600">
            {milestones.length === 0 ? (
              <li>None.</li>
            ) : (
              milestones.map((m) => (
                <li key={m.id}>
                  {m.title}
                  {m.completedAt ? " ✓" : ""}
                  {m.dueDate ? ` (due ${new Date(m.dueDate).toLocaleDateString()})` : ""}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
