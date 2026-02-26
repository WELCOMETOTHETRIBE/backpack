import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceControlTechnicalStatus,
  osAssets,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChevronLeft, CheckCircle2, XCircle, FileText } from "lucide-react";

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

  const statusRows = await db
    .select({
      controlId: evidenceControlTechnicalStatus.controlId,
      technicalOk: evidenceControlTechnicalStatus.technicalOk,
      missingFiles: evidenceControlTechnicalStatus.missingFiles,
      presentFiles: evidenceControlTechnicalStatus.presentFiles,
    })
    .from(evidenceControlTechnicalStatus)
    .where(eq(evidenceControlTechnicalStatus.evidenceRunId, run.id));

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

  const passed = statusRows.filter((r) => r.technicalOk).length;
  const failed = statusRows.filter((r) => !r.technicalOk).length;
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
        </div>

        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Summary</h2>
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">
            <span className="font-medium text-green-600">{passed} passed</span>
            {" · "}
            <span className="font-medium text-[var(--color-status-amber)]">{failed} failed</span>
            {" · "}
            {statusRows.length} controls evaluated
          </p>
        </section>

        <section className={cardClass}>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-gray-800)]">
            <FileText className="h-4 w-4" />
            Per-control adjudication
          </h2>
          {statusRows.length === 0 ? (
            <p className="text-sm text-[var(--color-gray-500)]">
              No control status rows for this run. Ensure the asset has a baseline profile and the bundle contained the expected files.
            </p>
          ) : (
            <ul className="space-y-4">
              {statusRows.map((row) => {
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
