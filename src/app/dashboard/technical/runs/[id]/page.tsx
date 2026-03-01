import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceControlTechnicalStatus,
  evidenceFindings,
  evidenceFiles,
  osAssets,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChevronLeft, CheckCircle2, XCircle, FileText, AlertCircle } from "lucide-react";

export default async function TechnicalRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { id } = await params;
  const [run] = await db
    .select()
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.id, id),
        eq(evidenceRuns.organizationId, orgId)
      )
    )
    .limit(1);

  if (!run) notFound();

  const findings = await db
    .select({
      controlId: evidenceFindings.controlId,
      pass: evidenceFindings.pass,
      partial: evidenceFindings.partial,
      observed: evidenceFindings.observed,
      expected: evidenceFindings.expected,
      evidenceHint: evidenceFindings.evidenceHint,
      evidenceFilesUsed: evidenceFindings.evidenceFilesUsed,
    })
    .from(evidenceFindings)
    .where(eq(evidenceFindings.evidenceRunId, run.id));

  const legacyStatusRows = await db
    .select({
      controlId: evidenceControlTechnicalStatus.controlId,
      technicalOk: evidenceControlTechnicalStatus.technicalOk,
      missingFiles: evidenceControlTechnicalStatus.missingFiles,
      presentFiles: evidenceControlTechnicalStatus.presentFiles,
    })
    .from(evidenceControlTechnicalStatus)
    .where(eq(evidenceControlTechnicalStatus.evidenceRunId, run.id));

  const runEvidenceFiles = await db
    .select({ path: evidenceFiles.path, sha256: evidenceFiles.sha256, sizeBytes: evidenceFiles.sizeBytes })
    .from(evidenceFiles)
    .where(eq(evidenceFiles.evidenceRunId, run.id));

  const [asset] = await db
    .select({ hostname: osAssets.hostname })
    .from(osAssets)
    .where(
      and(
        eq(osAssets.id, run.systemId),
        eq(osAssets.organizationId, orgId)
      )
    )
    .limit(1);

  const useFindings = findings.length > 0;
  const passed = useFindings
    ? findings.filter((f) => f.pass && !f.partial).length
    : legacyStatusRows.filter((r) => r.technicalOk).length;
  const partialCount = useFindings ? findings.filter((f) => f.partial).length : 0;
  const failed = useFindings
    ? findings.filter((f) => !f.pass).length
    : legacyStatusRows.filter((r) => !r.technicalOk).length;
  const controlsEvaluated = useFindings ? findings.length : legacyStatusRows.length;

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-[var(--color-gray-500)]">
          <Link
            href="/dashboard/technical"
            className="inline-flex items-center gap-1 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Technical onboarding
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">
            Run: {run.runId}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            {asset?.hostname ?? run.systemId} · Collected {new Date(run.collectedAt).toLocaleString()} · {run.collectorName} {run.collectorVersion}
          </p>
          {run.source === "azure_entra" &&
            run.manifest &&
            typeof run.manifest === "object" &&
            "report_sha256" in run.manifest &&
            typeof (run.manifest as Record<string, unknown>).report_sha256 === "string" && (
            <p className="mt-1 text-xs font-mono text-[var(--color-gray-500)]" title={(run.manifest as Record<string, unknown>).report_sha256 as string}>
              report_sha256: {(run.manifest as Record<string, unknown>).report_sha256 as string}
            </p>
          )}
        </div>

        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Summary</h2>
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">
            <span className="font-medium text-green-600">{passed} passed</span>
            {partialCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-amber-700">{partialCount} partial</span>
              </>
            )}
            {" · "}
            <span className="font-medium text-[var(--color-status-red)]">{failed} failed</span>
            {" · "}
            {controlsEvaluated} controls evaluated
          </p>
          {partialCount > 0 && (
            <p className="mt-1 text-xs text-[var(--color-gray-500)]">
              Partial: technical evidence passed; accompanying governance documentation, logs, or records required.
            </p>
          )}
        </section>

        {runEvidenceFiles.length > 0 && (
          <section className={cardClass}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-gray-800)]">
              <FileText className="h-4 w-4" />
              Evidence files (auditor review)
            </h2>
            <p className="mb-3 text-xs text-[var(--color-gray-500)]">
              Path, SHA-256, and size for files in this run.
            </p>
            <ul className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] p-3 font-mono text-xs">
              {runEvidenceFiles.map((f, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 gap-y-0.5 break-all">
                  <span className="text-[var(--color-gray-700)]">{f.path}</span>
                  <span className="text-[var(--color-gray-500)]" title={f.sha256}>
                    {f.sha256.slice(0, 16)}…
                  </span>
                  {f.sizeBytes > 0 && (
                    <span className="text-[var(--color-gray-400)]">({f.sizeBytes} B)</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={cardClass}>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-gray-800)]">
            <FileText className="h-4 w-4" />
            Per-control adjudication
          </h2>
          {controlsEvaluated === 0 ? (
            <p className="text-sm text-[var(--color-gray-500)]">
              No control status rows for this run. Ensure the asset has a baseline profile and the bundle contained the expected files, or upload a 73-check validation report.
            </p>
          ) : useFindings ? (
            <ul className="space-y-4">
              {findings
                .slice()
                .sort((a, b) => a.controlId.localeCompare(b.controlId))
                .map((f) => {
                  const filesUsed = Array.isArray(f.evidenceFilesUsed) ? f.evidenceFilesUsed : [];
                  return (
                    <li
                      key={f.controlId}
                      className="rounded-lg border border-[var(--color-border)] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium text-[var(--color-gray-800)]">
                          {f.controlId}
                        </span>
                        {f.partial ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700" title="Accompanying governance documentation, logs, or records required.">
                            <AlertCircle className="h-4 w-4" />
                            Partial
                          </span>
                        ) : f.pass ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-status-red)]">
                            <XCircle className="h-4 w-4" />
                            Fail
                          </span>
                        )}
                      </div>
                      {(f.observed || f.expected) && (
                        <div className="mt-3 space-y-1.5 rounded border border-[var(--color-border)] bg-[var(--color-gray-50)] p-3 text-xs">
                          {f.observed && (
                            <p>
                              <span className="font-medium text-[var(--color-gray-700)]">Observed:</span>{" "}
                              <span className="text-[var(--color-gray-600)]">{f.observed}</span>
                            </p>
                          )}
                          {f.expected && (
                            <p>
                              <span className="font-medium text-[var(--color-gray-700)]">Expected:</span>{" "}
                              <span className="text-[var(--color-gray-600)]">{f.expected}</span>
                            </p>
                          )}
                        </div>
                      )}
                      {filesUsed.length > 0 && (
                        <p className="mt-2 flex items-start gap-2 text-xs text-[var(--color-gray-600)]">
                          <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            Evidence files used: <code className="rounded bg-[var(--color-gray-100)] px-1">{filesUsed.join(", ")}</code>
                          </span>
                        </p>
                      )}
                      {f.evidenceHint && (
                        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
                          <span className="font-medium">Evidence artifacts for this control:</span> {f.evidenceHint}
                        </p>
                      )}
                    </li>
                  );
                })}
            </ul>
          ) : (
            <ul className="space-y-4">
              {legacyStatusRows.map((row) => {
                const missing = (row.missingFiles as string[]) ?? [];
                return (
                  <li
                    key={row.controlId}
                    className="rounded-lg border border-[var(--color-border)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium text-[var(--color-gray-800)]">
                        {row.controlId}
                      </span>
                      {row.technicalOk ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-status-amber)]">
                          <XCircle className="h-4 w-4" />
                          Fail
                        </span>
                      )}
                    </div>
                    {missing.length > 0 && (
                      <p className="mt-2 text-xs text-[var(--color-gray-600)]">
                        Missing files: <code className="rounded bg-[var(--color-gray-100)] px-1">{missing.join(", ")}</code>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
