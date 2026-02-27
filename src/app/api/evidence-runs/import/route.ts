import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFiles,
  evidenceControlTechnicalStatus,
  evidenceFindings,
  accountBoundary,
  osAssets,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPortalControlSchema } from "@/lib/compliance/schemas";
import { resolveApplicableControls } from "@/lib/os-baselines/resolver";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  computeInputsManifestSha256,
  computeRunFingerprint,
} from "@/lib/evidence/ingest";
import {
  isValidatorReport,
  type ValidatorReport,
} from "@/lib/evidence/validator-report";

const EVIDENCE_SOURCES = ["azure_entra", "windows_server_hardening"] as const;
type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

type ImportBody = {
  organization_id?: string;
  system_id: string;
  run_id: string;
  collected_at: string;
  collector_name?: string;
  collector_version?: string;
  bundle_root?: string;
  manifest?: unknown;
  /** Legacy: file list for file-based import */
  files?: Array<{ path: string; sha256: string; size_bytes: number }>;
  /** Report-based import: source + report (normalized validator output) */
  source?: EvidenceSource;
  report?: unknown;
};

async function resolveBoundaryIdForOrg(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ boundaryId: accountBoundary.boundaryId })
    .from(accountBoundary)
    .where(eq(accountBoundary.accountId, organizationId))
    .limit(1);
  return row?.boundaryId ?? null;
}

async function handleReportImport(
  _orgId: string,
  organization_id: string,
  body: ImportBody & { source: EvidenceSource; report: ValidatorReport }
) {
  const report = body.report;
  const boundaryId = await resolveBoundaryIdForOrg(organization_id);
  const inputs_manifest_sha256 = computeInputsManifestSha256(report.inputs ?? []);
  const validator_sha256 =
    (report.validator && typeof report.validator === "object" && "sha256" in report.validator
      ? String((report.validator as { sha256?: string }).sha256 ?? "")
      : "") as string;
  const runFingerprint = computeRunFingerprint({
    source: body.source,
    validator_sha256,
    inputs_manifest_sha256,
  });

  const [existing] = await db
    .select({ id: evidenceRuns.id, runId: evidenceRuns.runId })
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, organization_id),
        eq(evidenceRuns.runFingerprint, runFingerprint)
      )
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      run_id: existing.runId,
      evidence_run_id: existing.id,
    });
  }

  const [run] = await db
    .insert(evidenceRuns)
    .values({
      organizationId: organization_id,
      systemId: body.system_id,
      runId: body.run_id,
      collectedAt: new Date(body.collected_at),
      collectorName: report.validator?.name ?? body.collector_name ?? body.source,
      collectorVersion: report.validator?.version ?? body.collector_version ?? "unknown",
      bundleRoot: body.bundle_root ?? `${body.run_id}/`,
      manifest: { inputs: report.inputs, validator: report.validator },
      hashAlgorithm: "sha256",
      source: body.source,
      boundaryId: boundaryId ?? null,
      runFingerprint,
    })
    .returning();

  if (!run) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  const findings = report.checks.map((c) => ({
    evidenceRunId: run.id,
    controlId: c.control,
    pass: c.pass,
    observed: String(c.observed ?? ""),
    expected: String(c.expected ?? ""),
    evidenceHint: String(c.evidence_hint ?? ""),
    evidenceFilesUsed: Array.isArray(c.evidence_files_used) ? c.evidence_files_used : [],
    providerOrCustomer: c.provider_or_customer,
    layer: c.layer ?? null,
    details: c.details ?? null,
  }));

  if (findings.length) {
    await db.insert(evidenceFindings).values(findings);
  }

  if (Array.isArray(report.inputs) && report.inputs.length > 0) {
    await db.insert(evidenceFiles).values(
      report.inputs.map((f) => ({
        evidenceRunId: run.id,
        path: (f.filename || "").replaceAll("\\", "/"),
        sha256: (f.sha256 || "").toLowerCase().slice(0, 64) || "unknown",
        sizeBytes: Number(f.size ?? 0) || 0,
      }))
    );
  }

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: body.run_id,
    source: body.source,
    findings_count: findings.length,
  });
}

/**
 * POST /api/evidence-runs/import
 * Metadata-only import. No artifact upload.
 * Accepts either:
 * - Legacy: files[] + run metadata; technical status from baseline/portal.
 * - Report: source (azure_entra | windows_server_hardening) + report { validator, inputs, checks }; stores findings.
 * Runs are attached to the account's single boundary when present.
 * Requires Admin, Compliance, or Assessor.
 */
export async function POST(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as ImportBody;
  const organization_id = body.organization_id ?? orgId;

  if (!organization_id || !body.system_id || !body.run_id || !body.collected_at) {
    return NextResponse.json({ error: "Missing required fields: system_id, run_id, collected_at" }, { status: 400 });
  }

  const isReportImport =
    body.source &&
    EVIDENCE_SOURCES.includes(body.source) &&
    body.report != null &&
    isValidatorReport(body.report);

  if (isReportImport) {
    return handleReportImport(orgId, organization_id, body as ImportBody & { source: EvidenceSource; report: ValidatorReport });
  }

  if (!Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "files[] required (or provide source + report for validator report import)" }, { status: 400 });
  }

  const boundaryId = await resolveBoundaryIdForOrg(organization_id);
  const legacyInputs = body.files.map((f) => ({
    filename: (f.path || "").replaceAll("\\", "/"),
    sha256: (f.sha256 || "").toLowerCase(),
    size: Number(f.size_bytes ?? 0),
  }));
  const inputs_manifest_sha256 = computeInputsManifestSha256(legacyInputs);
  const runFingerprint = computeRunFingerprint({
    source: "legacy",
    validator_sha256: "",
    inputs_manifest_sha256,
  });

  const [existingLegacy] = await db
    .select({ id: evidenceRuns.id, runId: evidenceRuns.runId })
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, organization_id),
        eq(evidenceRuns.runFingerprint, runFingerprint)
      )
    )
    .limit(1);
  if (existingLegacy) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      run_id: existingLegacy.runId,
      evidence_run_id: existingLegacy.id,
    });
  }

  const [run] = await db
    .insert(evidenceRuns)
    .values({
      organizationId: organization_id,
      systemId: body.system_id,
      runId: body.run_id,
      collectedAt: new Date(body.collected_at),
      collectorName: body.collector_name ?? "unknown",
      collectorVersion: body.collector_version ?? "unknown",
      bundleRoot: body.bundle_root ?? `${body.run_id}/`,
      manifest: body.manifest ?? {},
      hashAlgorithm: "sha256",
      source: "legacy",
      boundaryId: boundaryId ?? null,
      runFingerprint,
    })
    .returning();

  if (!run) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  await db.insert(evidenceFiles).values(
    body.files.map((f) => ({
      evidenceRunId: run.id,
      path: (f.path || "").replaceAll("\\", "/"),
      sha256: (f.sha256 || "").toLowerCase(),
      sizeBytes: Number(f.size_bytes || 0),
    }))
  );

  const present = new Set<string>(
    body.files.map((f) => (f.path || "").replaceAll("\\", "/"))
  );

  type StatusRow = {
    evidenceRunId: string;
    controlId: string;
    technicalOk: boolean;
    missingFiles: string[];
    presentFiles: string[];
    osAssetId?: string | null;
    baselineProfileId?: string | null;
  };

  const statuses: StatusRow[] = [];

  // Check if system_id is an OS asset in this org (for baseline-aware scoring)
  const [osAssetRow] = await db
    .select({ id: osAssets.id, baselineProfileId: osAssets.baselineProfileId })
    .from(osAssets)
    .where(
      and(
        eq(osAssets.id, body.system_id),
        eq(osAssets.organizationId, organization_id)
      )
    );

  if (osAssetRow?.baselineProfileId) {
    const { controls, checksByControlId } = await resolveApplicableControls({
      id: osAssetRow.id,
      baselineProfileId: osAssetRow.baselineProfileId,
    });

    for (const c of controls) {
      const checks = checksByControlId[c.controlId] ?? [];
      const requiredFiles = Array.from(
        new Set(checks.flatMap((ch) => ch.evidenceRequiredFiles ?? []))
      );
      if (requiredFiles.length === 0) continue;

      const missing = requiredFiles.filter((p) => !present.has(p));
      const ok = missing.length === 0;

      statuses.push({
        evidenceRunId: run.id,
        controlId: c.controlId,
        technicalOk: ok,
        missingFiles: missing,
        presentFiles: requiredFiles.filter((p) => present.has(p)),
        osAssetId: osAssetRow.id,
        baselineProfileId: osAssetRow.baselineProfileId,
      });
    }
  }

  if (statuses.length === 0) {
    // Fallback: use portal schema for all controls with technical_validation (legacy / non-baseline runs)
    const portal = getPortalControlSchema();
    const portalControls = (portal?.controls ?? []) as Array<{
      control_id: string;
      technical_validation?: { required_files?: string[] };
    }>;
    for (const c of portalControls) {
      const requiredFiles: string[] = c?.technical_validation?.required_files ?? [];
      if (!requiredFiles.length) continue;

      const missing = requiredFiles.filter((p) => !present.has(p));
      const ok = missing.length === 0;

      statuses.push({
        evidenceRunId: run.id,
        controlId: c.control_id,
        technicalOk: ok,
        missingFiles: missing,
        presentFiles: requiredFiles.filter((p) => present.has(p)),
      });
    }
  }

  if (statuses.length) {
    await db.insert(evidenceControlTechnicalStatus).values(statuses);
  }

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: body.run_id,
    technical_controls_evaluated: statuses.length,
  });
}
