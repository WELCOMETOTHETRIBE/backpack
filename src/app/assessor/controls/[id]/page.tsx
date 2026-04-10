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
  controlEvidenceLinks,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  ArrowLeft,
  FileText,
  Terminal,
  Link2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-700", label: "Not Started" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  implemented: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Implemented" },
  assessed: { bg: "bg-violet-100", text: "text-violet-700", label: "Assessed" },
  inherited: { bg: "bg-teal-100", text: "text-teal-700", label: "Inherited" },
  not_applicable: { bg: "bg-slate-100", text: "text-slate-700", label: "N/A" },
};

const HISTORY_LABELS: Record<string, string> = {
  governanceNarrative: "Governance narrative",
  implementationStatus: "Status",
  validationMethod: "Validation method",
  monitoringCadence: "Review cadence",
  responsibleRoleId: "Responsible role",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES["not_started"]!;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3.5">
        <Icon className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
        <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

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
      validationMethod: controlRecords.validationMethod,
      monitoringCadence: controlRecords.monitoringCadence,
      lastValidationDate: controlRecords.lastValidationDate,
      title: controls.title,
      nistExactText: controls.nistExactText,
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

  const [artList, techList, evidenceList, historyList] = await Promise.all([
    db
      .select({
        id: artifacts.id,
        artifactLabel: artifacts.artifactLabel,
        fileName: artifacts.fileName,
        fileUrl: artifacts.fileUrl,
      })
      .from(artifacts)
      .where(eq(artifacts.controlRecordId, record.id)),

    db
      .select({
        id: technicalEvidence.id,
        requirementId: technicalEvidence.requirementId,
        description: technicalEvidence.description,
        fileUrl: technicalEvidence.fileUrl,
        sourceUrl: technicalEvidence.sourceUrl,
        evidenceType: technicalEvidence.evidenceType,
      })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.controlRecordId, record.id)),

    db
      .select({
        id: controlEvidenceLinks.id,
        runId: controlEvidenceLinks.runId,
        filePath: controlEvidenceLinks.filePath,
        sha256Hash: controlEvidenceLinks.sha256Hash,
        description: controlEvidenceLinks.description,
        source: controlEvidenceLinks.source,
        linkedAt: controlEvidenceLinks.linkedAt,
        expiresAt: controlEvidenceLinks.expiresAt,
      })
      .from(controlEvidenceLinks)
      .where(eq(controlEvidenceLinks.controlRecordId, record.id)),

    db
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
      .orderBy(desc(controlRecordHistory.createdAt))
      .limit(20),
  ]);

  const now = Date.now();
  const statusStyle = STATUS_STYLES[record.implementationStatus] ?? STATUS_STYLES["not_started"]!;

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Back link */}
        <Link
          href="/assessor/controls"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to controls
        </Link>

        {/* Header */}
        <div className="rounded-xl border border-[var(--color-border)] bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm font-semibold text-[var(--color-navy-primary)]">{record.controlId}</p>
              <h1 className="mt-1 text-xl font-bold text-[var(--color-gray-900)]">
                {record.title ?? record.controlId}
              </h1>
              {record.nistExactText && (
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-600)] max-w-2xl">
                  {record.nistExactText}
                </p>
              )}
            </div>
            <StatusBadge status={record.implementationStatus} />
          </div>

          {/* Meta row */}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--color-border)] pt-4 text-sm">
            {record.roleName && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Responsible role</dt>
                <dd className="mt-0.5 text-[var(--color-gray-700)]">{record.roleName}</dd>
              </div>
            )}
            {record.validationMethod && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Validation method</dt>
                <dd className="mt-0.5 capitalize text-[var(--color-gray-700)]">{record.validationMethod}</dd>
              </div>
            )}
            {record.monitoringCadence && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Review cadence</dt>
                <dd className="mt-0.5 capitalize text-[var(--color-gray-700)]">{record.monitoringCadence}</dd>
              </div>
            )}
            {record.lastValidationDate && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Last validated</dt>
                <dd className="mt-0.5 text-[var(--color-gray-700)]">
                  {new Date(record.lastValidationDate).toLocaleDateString()}
                </dd>
              </div>
            )}
            {record.inheritedFrom && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Inherited from</dt>
                <dd className="mt-0.5 text-teal-700">{record.inheritedFrom}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Assessor findings */}
        {record.assessorFindings && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Assessor Findings</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-violet-900">
              {record.assessorFindings}
            </p>
            {record.assessmentDate && (
              <p className="mt-1 text-xs text-violet-600">
                Assessment date: {new Date(record.assessmentDate).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Governance narrative */}
        <SectionCard title="Governance Narrative" icon={FileText}>
          {record.governanceNarrative ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-gray-700)]">
              {record.governanceNarrative}
            </p>
          ) : (
            <p className="text-sm italic text-[var(--color-gray-400)]">No governance narrative authored.</p>
          )}
        </SectionCard>

        {/* Technical narrative */}
        {record.technicalNarrative && (
          <SectionCard title="Technical Narrative" icon={Terminal}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-gray-700)]">
              {record.technicalNarrative}
            </p>
          </SectionCard>
        )}

        {/* Governance artifacts */}
        <SectionCard title={`Governance Artifacts (${artList.length})`} icon={FileText}>
          {artList.length === 0 ? (
            <p className="text-sm italic text-[var(--color-gray-400)]">No governance artifacts uploaded.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {artList.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-gray-800)]">{a.artifactLabel}</p>
                    <p className="text-xs text-[var(--color-gray-500)]">{a.fileName}</p>
                  </div>
                  <a
                    href={`/api/artifacts/${a.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Technical evidence */}
        {techList.length > 0 && (
          <SectionCard title={`Technical Evidence (${techList.length})`} icon={Terminal}>
            <ul className="divide-y divide-[var(--color-border)]">
              {techList.map((t) => (
                <li key={t.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[var(--color-navy-primary)]">
                        {t.requirementId ?? t.evidenceType ?? "Evidence"}
                      </p>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">{t.description}</p>
                      )}
                    </div>
                    {(t.fileUrl || t.sourceUrl) && (
                      <a
                        href={t.fileUrl || t.sourceUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        View
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* Evidence metadata links */}
        <SectionCard title={`Evidence Metadata (${evidenceList.length})`} icon={Link2}>
          {evidenceList.length === 0 ? (
            <p className="text-sm italic text-[var(--color-gray-400)]">No evidence metadata entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Run ID</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">File Path</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">SHA-256</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Source</th>
                    <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {evidenceList.map((e) => {
                    const isInherited = e.runId.startsWith("INHERITED-");
                    const expired = e.expiresAt ? new Date(e.expiresAt).getTime() < now : false;
                    const expiringSoon = e.expiresAt
                      ? new Date(e.expiresAt).getTime() - now < 30 * 86_400_000 && !expired
                      : false;
                    return (
                      <tr key={e.id} className="py-2">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1.5">
                            {isInherited && (
                              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                                Inherited
                              </span>
                            )}
                            <span className="font-mono text-xs text-[var(--color-gray-700)]">{e.runId}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-[var(--color-gray-600)]">{e.filePath}</td>
                        <td className="py-2 pr-3">
                          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
                            {e.sha256Hash.slice(0, 16)}…
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-[var(--color-gray-600)]">{e.source ?? "—"}</td>
                        <td className="py-2 text-right text-xs">
                          {e.expiresAt ? (
                            <span className={expired ? "text-red-600 font-medium" : expiringSoon ? "text-amber-600 font-medium" : "text-[var(--color-gray-600)]"}>
                              {new Date(e.expiresAt).toLocaleDateString()}
                              {expired && " (expired)"}
                              {expiringSoon && " (soon)"}
                            </span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Change history */}
        <SectionCard title="Change History" icon={Clock}>
          {historyList.length === 0 ? (
            <p className="text-sm italic text-[var(--color-gray-400)]">No changes recorded.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {historyList.map((h) => (
                <li key={h.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-gray-700)]">
                        {HISTORY_LABELS[h.fieldName] ?? h.fieldName}
                      </p>
                      {(h.oldValue != null || h.newValue != null) && (
                        <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                          {h.oldValue != null && (
                            <span className="line-through text-red-500">{String(h.oldValue).slice(0, 60)}</span>
                          )}
                          {h.oldValue != null && h.newValue != null && " → "}
                          {h.newValue != null && (
                            <span className="text-emerald-600">{String(h.newValue).slice(0, 60)}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs text-[var(--color-gray-400)]">
                      <p>{h.changedByEmail ?? "System"}</p>
                      <p>{h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
