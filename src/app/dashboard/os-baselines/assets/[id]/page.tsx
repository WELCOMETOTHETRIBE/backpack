import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { osAssets, osBaselineProfiles, boundaries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import Link from "next/link";
import { ChevronRight, CheckCircle2, XCircle, FileText, Terminal, Upload } from "lucide-react";
import { resolveApplicableControls } from "@/lib/os-baselines/resolver";
import {
  evidenceRuns,
  evidenceControlTechnicalStatus,
} from "@/db/schema";
import { AssignBaselineForm } from "./AssignBaselineForm";
import { EditAssetForm } from "./EditAssetForm";
import { DeleteAssetButton } from "./DeleteAssetButton";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { id } = await params;
  const [asset] = await db
    .select()
    .from(osAssets)
    .where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)));
  if (!asset) notFound();

  const [boundary] = await db
    .select({ id: boundaries.id, name: boundaries.name })
    .from(boundaries)
    .where(eq(boundaries.id, asset.boundaryId));

  const assetsInBoundary = await db
    .select({ id: osAssets.id })
    .from(osAssets)
    .where(eq(osAssets.boundaryId, asset.boundaryId));
  const singleSystemEnclave =
    assetsInBoundary.length === 1 && asset.baselineProfileId != null;

  const [baselineProfile] = asset.baselineProfileId
    ? await db
        .select({ id: osBaselineProfiles.id, name: osBaselineProfiles.name, version: osBaselineProfiles.version })
        .from(osBaselineProfiles)
        .where(eq(osBaselineProfiles.id, asset.baselineProfileId))
        .limit(1)
    : [null];

  const { controls, checksByControlId } = await resolveApplicableControls({
    id: asset.id,
    baselineProfileId: asset.baselineProfileId,
  });

  const [latestRun] = await db
    .select()
    .from(evidenceRuns)
    .where(and(eq(evidenceRuns.organizationId, orgId), eq(evidenceRuns.systemId, id)))
    .orderBy(desc(evidenceRuns.collectedAt))
    .limit(1);

  let statusByControl: Record<string, boolean> = {};
  if (latestRun) {
    const rows = await db
      .select({ controlId: evidenceControlTechnicalStatus.controlId, technicalOk: evidenceControlTechnicalStatus.technicalOk })
      .from(evidenceControlTechnicalStatus)
      .where(eq(evidenceControlTechnicalStatus.evidenceRunId, latestRun.id));
    statusByControl = Object.fromEntries(rows.map((r) => [r.controlId, r.technicalOk]));
  }

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-[var(--color-gray-500)]">
          <Link href="/dashboard/os-baselines" className="hover:underline">
            System Boundary
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link
            href={`/dashboard/os-baselines/boundaries/${asset.boundaryId}`}
            className="hover:underline"
          >
            {boundary?.name ?? "Boundary"}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-[var(--color-gray-700)]">{asset.hostname}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
              {asset.hostname}
            </h1>
            <p className="mt-2 text-[var(--color-gray-600)]">
              {asset.osFamily} {asset.osVersion} · {asset.role}
              {baselineProfile && (
                <> · Baseline: {baselineProfile.name} v{baselineProfile.version}</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <EditAssetForm
              assetId={asset.id}
              initialHostname={asset.hostname}
              initialOsFamily={asset.osFamily}
              initialOsVersion={asset.osVersion}
              initialRole={asset.role}
              initialBaselineProfileId={asset.baselineProfileId}
            />
            <DeleteAssetButton
              assetId={asset.id}
              hostname={asset.hostname}
              boundaryId={asset.boundaryId}
            />
          </div>
        </div>

        {singleSystemEnclave && (
          <section className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-navy-primary)]">
              This is the only system in this enclave
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
              Evidence you upload for this system (in Technical onboarding) is used to fully adjudicate technical controls for this boundary.
            </p>
            <Link
              href="/dashboard/technical/upload"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              <Upload className="h-4 w-4" />
              Upload evidence for this system
            </Link>
          </section>
        )}

        {latestRun && (
          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
              Latest evidence run
            </h2>
            <p className="mt-2 text-sm text-[var(--color-gray-600)]">
              Run ID: <code className="rounded bg-[var(--color-gray-100)] px-1">{latestRun.runId}</code>
              {" · "}
              Collected: {new Date(latestRun.collectedAt).toLocaleString()}
              {" · "}
              Collector: {latestRun.collectorName}
            </p>
          </section>
        )}

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
            Applicable technical controls
          </h2>
          {controls.length === 0 ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[var(--color-gray-500)]">
                {asset.baselineProfileId
                  ? "This baseline has no required controls."
                  : "Assign a baseline profile so evidence bundles can be scored against the right controls."}
              </p>
              {!asset.baselineProfileId && (
                <AssignBaselineForm
                  assetId={asset.id}
                  osFamily={asset.osFamily}
                  osVersion={asset.osVersion}
                  role={asset.role}
                />
              )}
            </div>
          ) : (
            <ul className="mt-4 space-y-6">
              {controls.map((c) => {
                const checks = checksByControlId[c.controlId] ?? [];
                const status = statusByControl[c.controlId];
                return (
                  <li
                    key={c.controlId}
                    className="rounded-lg border border-[var(--color-border)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-[var(--color-gray-900)]">
                        {c.controlId}
                      </span>
                      {status !== undefined && (
                        status ? (
                          <span className="inline-flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm text-amber-600">
                            <XCircle className="h-4 w-4" />
                            Fail
                          </span>
                        )
                      )}
                    </div>
                    {c.rationale && (
                      <p className="mt-1 text-sm text-[var(--color-gray-500)]">
                        {c.rationale}
                      </p>
                    )}
                    {checks.map((ch) => (
                      <div key={ch.checkId} className="mt-4 border-t border-[var(--color-border)] pt-4">
                        <p className="text-sm font-medium text-[var(--color-gray-700)]">
                          Expected: {ch.expectedSetting}
                        </p>
                        {ch.evidenceRequiredFiles.length > 0 && (
                          <div className="mt-2 flex items-start gap-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-[var(--color-gray-500)]" />
                            <div>
                              <span className="text-[var(--color-gray-600)]">Collector paths: </span>
                              <code className="rounded bg-[var(--color-gray-100)] px-1 text-xs">
                                {ch.evidenceRequiredFiles.join(", ")}
                              </code>
                            </div>
                          </div>
                        )}
                        {ch.manualCommands && ch.manualCommands.length > 0 && (
                          <div className="mt-2 flex items-start gap-2 text-sm">
                            <Terminal className="h-4 w-4 shrink-0 text-[var(--color-gray-500)]" />
                            <pre className="overflow-x-auto rounded bg-[var(--color-gray-100)] p-2 text-xs">
                              {ch.manualCommands.join("\n")}
                            </pre>
                          </div>
                        )}
                        {ch.remediationGuidance && (
                          <p className="mt-2 text-sm text-[var(--color-gray-600)]">
                            <span className="font-medium">Remediation:</span> {ch.remediationGuidance}
                          </p>
                        )}
                      </div>
                    ))}
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
