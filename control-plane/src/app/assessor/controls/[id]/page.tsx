import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  roles,
  artifacts,
  technicalEvidence,
  controlRecordHistory,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export default async function AssessorControlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId || user?.role !== "Assessor") notFound();
  const { id: controlId } = await params;

  const [record] = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      governanceNarrative: controlRecords.governanceNarrative,
      technicalNarrative: controlRecords.technicalNarrative,
      responsibleRoleId: controlRecords.responsibleRoleId,
      inheritedFrom: controlRecords.inheritedFrom,
      assessorFindings: controlRecords.assessorFindings,
      assessmentDate: controlRecords.assessmentDate,
      title: controls.title,
      roleName: roles.name,
    })
    .from(controlRecords)
    .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        eq(controlRecords.controlId, controlId)
      )
    )
    .limit(1);

  if (!record) notFound();

  const artList = await db
    .select({
      id: artifacts.id,
      artifactLabel: artifacts.artifactLabel,
      fileName: artifacts.fileName,
      fileUrl: artifacts.fileUrl,
      storageKey: artifacts.storageKey,
    })
    .from(artifacts)
    .where(eq(artifacts.controlRecordId, record.id));

  const techList = await db
    .select({
      id: technicalEvidence.id,
      requirementId: technicalEvidence.requirementId,
      description: technicalEvidence.description,
      fileUrl: technicalEvidence.fileUrl,
      sourceUrl: technicalEvidence.sourceUrl,
      evidenceType: technicalEvidence.evidenceType,
    })
    .from(technicalEvidence)
    .where(eq(technicalEvidence.controlRecordId, record.id));

  const historyList = await db
    .select({
      id: controlRecordHistory.id,
      fieldName: controlRecordHistory.fieldName,
      oldValue: controlRecordHistory.oldValue,
      newValue: controlRecordHistory.newValue,
      createdAt: controlRecordHistory.createdAt,
      changedByEmail: users.email,
    })
    .from(controlRecordHistory)
    .leftJoin(users, eq(controlRecordHistory.changedById, users.id))
    .where(eq(controlRecordHistory.controlRecordId, record.id))
    .orderBy(desc(controlRecordHistory.createdAt));

  return (
    <div>
      <Link href="/assessor" className="mb-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">
        ← Back to Assessor view
      </Link>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">
        {record.controlId} — {record.title ?? record.controlId}
      </h1>
      <div className="space-y-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Status & role</h2>
          <p className="text-sm text-zinc-600">
            <span className="font-medium">{record.implementationStatus}</span>
            {record.roleName && ` · Responsible role: ${record.roleName}`}
            {record.inheritedFrom && ` · Inherited from: ${record.inheritedFrom}`}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Governance narrative</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-600">
            {record.governanceNarrative ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Technical narrative</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-600">
            {record.technicalNarrative ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Governance artifacts</h2>
          {artList.length === 0 ? (
            <p className="text-sm text-zinc-500">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {artList.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded border border-zinc-100 p-2">
                  <span className="text-zinc-700">{a.artifactLabel} — {a.fileName}</span>
                  <a
                    href={`/api/artifacts/${a.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Technical evidence</h2>
          {techList.length === 0 ? (
            <p className="text-sm text-zinc-500">None.</p>
          ) : (
            <ul className="space-y-2 text-sm text-zinc-600">
              {techList.map((t) => (
                <li key={t.id} className="rounded border border-zinc-100 p-2">
                  <span className="font-mono text-zinc-700">{t.requirementId ?? t.evidenceType}</span>
                  {t.description && ` — ${t.description}`}
                  {(t.fileUrl || t.sourceUrl) && (
                    <a
                      href={t.fileUrl || t.sourceUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      View / download
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-zinc-800">Change history</h2>
          {historyList.length === 0 ? (
            <p className="text-sm text-zinc-500">No changes recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm text-zinc-600">
              {historyList.map((h) => (
                <li key={h.id} className="rounded border border-zinc-100 p-2">
                  <span className="font-medium text-zinc-800">{h.fieldName}</span>
                  {h.oldValue != null && `: "${String(h.oldValue).slice(0, 50)}…" → `}
                  {h.newValue != null && `"${String(h.newValue).slice(0, 50)}…"`}
                  <span className="ml-2 text-zinc-500">
                    {h.changedByEmail ?? "—"} · {h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
