import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  poamEntries,
  controlRecords,
  poamEntryMilestones,
  poamEntryClosureApprovals,
  users,
  roles,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { PoamEntryClient } from "./PoamEntryClient";

export default async function PoamEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as {
    organizationId?: string;
    id?: string;
    role?: string;
  } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) notFound();

  const { id } = await params;

  const [entry] = await db
    .select()
    .from(poamEntries)
    .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
    .limit(1);
  if (!entry) notFound();

  const [record] = await db
    .select({ controlId: controlRecords.controlId })
    .from(controlRecords)
    .where(eq(controlRecords.id, entry.controlRecordId))
    .limit(1);

  const milestones = await db
    .select()
    .from(poamEntryMilestones)
    .where(eq(poamEntryMilestones.poamEntryId, id))
    .orderBy(asc(poamEntryMilestones.orderIndex));

  const closureApprovals = await db
    .select({
      id: poamEntryClosureApprovals.id,
      approverId: poamEntryClosureApprovals.approverId,
      approvalOrder: poamEntryClosureApprovals.approvalOrder,
      attestedAt: poamEntryClosureApprovals.attestedAt,
      approverEmail: users.email,
    })
    .from(poamEntryClosureApprovals)
    .leftJoin(users, eq(poamEntryClosureApprovals.approverId, users.id))
    .where(eq(poamEntryClosureApprovals.poamEntryId, id));

  const orgRoles = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.organizationId, orgId));

  const initial = {
    ...entry,
    controlId: record?.controlId ?? null,
    milestones,
    closureApprovals,
  };

  return (
    <div>
      <Link
        href="/dashboard/poam"
        className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Back to POA&M
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">
          POA&M — Control {initial.controlId ?? entry.controlRecordId}
        </h1>
        <span
          className={`rounded px-2 py-1 text-sm font-medium ${
            entry.status === "closed"
              ? "bg-green-100 text-green-800"
              : "bg-zinc-100 text-zinc-700"
          }`}
        >
          {entry.status}
        </span>
      </div>
      <PoamEntryClient
        entryId={id}
        initial={initial}
        roles={orgRoles}
        userRole={user?.role ?? "Assessor"}
        userId={user?.id}
      />
    </div>
  );
}
