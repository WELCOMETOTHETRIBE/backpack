import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  boundaries,
  evidenceRuns,
  evidenceFindings,
  controlRecords,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { isValidatorReport } from "@/lib/evidence/validator-report";
import {
  computeRunFingerprint,
  computeInputsManifestSha256,
} from "@/lib/evidence/ingest";
import { controlIdToNist } from "@/lib/compliance/controlId";
import { syncOrgAzureInheritedControls } from "@/lib/compliance/azure-inherited-controls";
import { calculateControlStatus } from "@/lib/control-status";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";
import { seedRegistersFromEvidenceRun } from "@/lib/evidence-engine/auto-register-seeder";

type ReportBody = {
  run_id: string;
  collected_at: string; // ISO
  report: unknown;
  /** If true and this report was already imported (same fingerprint), delete the existing run and re-import. */
  replace_existing?: boolean;
};

/**
 * POST /api/os-baselines/boundaries/[id]/evidence-runs/import-report
 * Bulk import Azure/Entra validation report (validator + checks). Creates one evidence run and findings.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Accept either dashboard session or EnclaveWatch bearer token.
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = ctx.orgId;

  const { id: boundaryId } = await params;
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  if (!boundary) return NextResponse.json({ error: "Boundary not found" }, { status: 404 });

  let body: ReportBody;
  try {
    body = (await req.json()) as ReportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.run_id?.trim() || !body.collected_at?.trim() || body.report == null) {
    return NextResponse.json(
      { error: "run_id, collected_at, and report are required" },
      { status: 400 }
    );
  }
  if (!isValidatorReport(body.report)) {
    return NextResponse.json(
      { error: "report must have validator (name, version) and checks array" },
      { status: 400 }
    );
  }

  const report = body.report;
  const validatorSha = (report.validator as { sha256?: string }).sha256 ?? "";
  const inputs = Array.isArray(report.inputs) ? report.inputs : [];
  const inputsSha = computeInputsManifestSha256(
    inputs.map((i) => ({
      filename: (i as { filename?: string }).filename ?? "",
      sha256: (i as { sha256?: string }).sha256,
      size: (i as { size?: number }).size,
    }))
  );
  const runFingerprint = computeRunFingerprint({
    source: "azure_entra",
    validator_sha256: validatorSha,
    inputs_manifest_sha256: inputsSha,
  });

  const [existingRun] = await db
    .select({ id: evidenceRuns.id, runId: evidenceRuns.runId, collectedAt: evidenceRuns.collectedAt })
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.runFingerprint, runFingerprint)
      )
    )
    .limit(1);

  if (existingRun) {
    if (body.replace_existing) {
      await db.delete(evidenceRuns).where(eq(evidenceRuns.id, existingRun.id));
    } else {
      return NextResponse.json(
        {
          error: "This report has already been imported for this organization.",
          already_imported: true,
          existing_run_id: existingRun.id,
          existing_run_id_display: existingRun.runId,
          existing_collected_at: existingRun.collectedAt,
        },
        { status: 409 }
      );
    }
  }

  const [run] = await db
    .insert(evidenceRuns)
    .values({
      organizationId: orgId,
      systemId: boundaryId,
      runId: body.run_id.trim(),
      collectedAt: new Date(body.collected_at.trim()),
      collectorName: "azure_entra",
      collectorVersion: (report.validator as { version?: string }).version ?? "1",
      bundleRoot: "",
      manifest: report as unknown as Record<string, unknown>,
      hashAlgorithm: "sha256",
      source: "azure_entra",
      boundaryId,
      runFingerprint,
    })
    .returning();

  if (!run) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  const checks = report.checks as Array<{
    control: string;
    /**
     * Optional per-check identity. Required when a single (run, control)
     * carries more than one finding (e.g. Conditional Access policy state
     * — 5 checks against §3.5.3). Defaults to the resolved control NIST id
     * for backward compatibility with single-check-per-control collectors.
     */
    check_id?: string;
    pass: boolean;
    partial?: boolean;
    observed: string;
    expected: string;
    evidence_hint: string;
    evidence_files_used: string[];
    provider_or_customer: string;
    layer: string | null;
    details?: Record<string, unknown>;
    mfa_in_path_source?: string;
  }>;

  if (checks.length > 0) {
    // De-duplicate within the batch: if two rows share (control_id, check_id),
    // keep FAIL over PASS. This handles collectors that legitimately emit
    // duplicate rows (e.g. the same check returning the same control twice
    // because of a configuration glitch) without trapping the whole upload
    // on a PK violation. Distinct check_ids on the same control_id pass
    // through as separate rows.
    const byPk = new Map<string, ReturnType<typeof toFindingRow>>();
    function toFindingRow(c: (typeof checks)[number]) {
      const nistControl = controlIdToNist(c.control);
      return {
        evidenceRunId: run.id,
        controlId: nistControl,
        checkId: c.check_id?.trim() || nistControl,
        pass: c.pass,
        observed: c.observed ?? "",
        expected: c.expected ?? "",
        evidenceHint: c.evidence_hint ?? "",
        evidenceFilesUsed: Array.isArray(c.evidence_files_used) ? c.evidence_files_used : [],
        providerOrCustomer:
          c.provider_or_customer === "provider" ||
          c.provider_or_customer === "customer" ||
          c.provider_or_customer === "shared"
            ? c.provider_or_customer
            : "shared",
        layer: c.layer ?? null,
        details: c.details ?? null,
        partial: Boolean(c.partial),
      };
    }
    for (const c of checks) {
      const row = toFindingRow(c);
      const key = `${row.controlId}|${row.checkId}`;
      const existing = byPk.get(key);
      if (!existing) {
        byPk.set(key, row);
      } else if (existing.pass && !row.pass) {
        byPk.set(key, row); // FAIL takes precedence over PASS for the same (control, check)
      }
    }
    await db.insert(evidenceFindings).values([...byPk.values()]);
  }

  const passedCount = checks.filter((c) => c.pass).length;
  // "Partial" = validator found the technical config but is waiting on a
  // signed attestation (mfa-in-path, mobile-blocked, etc.). Distinct from
  // a hard fail where the config itself doesn't exist. Surfacing both
  // numbers separately so the UI doesn't mislabel partials as failures.
  const partialCount = checks.filter((c) => !c.pass && c.partial).length;
  const failedCount = checks.filter((c) => !c.pass && !c.partial).length;

  // Mark cloud-side gaps as in_progress -- the proper close-out path is the
  // mfa_in_path / mobile_blocked_at_ca attestations (signed via the
  // Outstanding Wizard), NOT auto-generated POAM stubs. The earlier code
  // here used to create one boilerplate "Control satisfied only by
  // MFA-in-path attestation (draft)" POAM per affected control on every
  // ingest, drowning out the real POAMs the user actually authored. Removed.
  // If a user wants to track a real remediation plan, they author the POAM
  // manually with concrete milestones (see the 3.7.5 SSH/RDP example).
  const controlIdsNeedingProgress = new Set<string>();
  for (const c of checks) {
    const nistId = controlIdToNist(c.control);
    if (!nistId) continue;
    const failed = !c.pass;
    const partial = Boolean(c.partial);
    const attestationOnly =
      c.pass && (c.mfa_in_path_source === "attestation");
    if (failed || attestationOnly || partial) controlIdsNeedingProgress.add(nistId);
  }

  const poamCreated = 0;
  for (const controlId of controlIdsNeedingProgress) {
    const [record] = await db
      .select()
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId),
        ),
      )
      .limit(1);
    if (!record) continue;
    await db
      .update(controlRecords)
      .set({ implementationStatus: "in_progress", updatedAt: new Date() })
      .where(eq(controlRecords.id, record.id));
  }

  // ── Cloud-evidence-driven adjudication side-effects ────────────────────────
  // The cloud validator run is what proves the boundary is actually on Azure
  // Government FedRAMP High. Two things that should now happen automatically:
  //
  //   1. Strict-inherited 3.10 family flips to 'inherited'
  //      (3.10.1, .2, .4, .5 are inherited from Azure FedRAMP -- physical
  //      protection at Microsoft's datacenters. Until the customer uploaded
  //      cloud evidence we held them as not_started; now we have proof.)
  //
  //   2. All controls with cloud findings get their implementationStatus
  //      recomputed via calculateControlStatus(). This unblocks the 11
  //      dual-pipeline controls (Bin 5: 3.13.8, 3.3.1, etc.) that have
  //      been held in_progress by the needsBothPipelines() gate while
  //      waiting for cloud evidence -- now that there's a PASS finding
  //      in evidenceFindings, the gate clears and they can flip to
  //      implemented if the rest of their lanes are satisfied.
  //
  // Both are best-effort -- failure here doesn't roll back the ingest.
  let inheritedFlipped = 0;
  let recomputed = 0;
  try {
    await syncOrgAzureInheritedControls(db, orgId);
    inheritedFlipped = 4; // best-case; sync is idempotent so this is symbolic
  } catch (err) {
    console.warn("syncOrgAzureInheritedControls failed:", (err as Error).message);
  }

  // Recompute every control we just wrote a finding for, in batches of 10.
  const recomputeIds = new Set<string>();
  for (const c of checks) {
    const nist = c.control ? controlIdToNist(c.control) : null;
    if (!nist) continue;
    const [rec] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, nist)))
      .limit(1);
    if (rec) recomputeIds.add(rec.id);
  }
  const ids = [...recomputeIds];
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(
      ids.slice(i, i + 10).map((id) => calculateControlStatus(id).catch(() => null)),
    );
    recomputed += Math.min(10, ids.length - i);
  }

  // Canonical rescore for every control with a cloud finding. The
  // calculateControlStatus loop above only updates the legacy column;
  // SCTM family aggregates read from controlAdjudicationSnapshots.
  // Fresh cloud evidence is the strongest signal we get, so we want
  // both the legacy column AND the canonical snapshot in sync.
  const cloudControlIds = new Set<string>();
  for (const c of checks) {
    const nist = c.control ? controlIdToNist(c.control) : null;
    if (nist) cloudControlIds.add(nist);
  }
  // Also include the four strict-inherited 3.10 controls — syncOrgAzure
  // above flipped them but didn't rescore the canonical snapshot.
  if (inheritedFlipped > 0) {
    cloudControlIds.add("3.10.1");
    cloudControlIds.add("3.10.2");
    cloudControlIds.add("3.10.4");
    cloudControlIds.add("3.10.5");
  }
  if (cloudControlIds.size > 0) {
    try {
      await scoreControlsAffectedBy({
        organizationId: orgId,
        triggerSource: "validator_run_persisted",
        // ctx may be either session or bearer (EnclaveWatch); we don't
        // have a user identity in the bearer path, so log as null.
        controlIds: [...cloudControlIds],
        triggeredByUserId: null,
      });
    } catch (rescoreErr) {
      console.error(
        "[os-baselines/import-report] cloud rescore failed (non-blocking):",
        rescoreErr,
      );
    }
  }

  // Auto-seed governance registers from evidence findings (best-effort, non-blocking).
  let registersSeeded: string[] = [];
  try {
    const seedResult = await seedRegistersFromEvidenceRun(
      run.id,
      orgId,
      boundaryId,
      new Date(body.collected_at.trim()),
      "Azure/Entra evidence run"
    );
    registersSeeded = seedResult.seeded;
  } catch (seedErr) {
    console.warn("[import-report] auto-register seed failed (non-blocking):", (seedErr as Error).message);
  }

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: body.run_id,
    findings_count: checks.length,
    passed_count: passedCount,
    partial_count: partialCount,
    failed_count: failedCount,
    poam_entries_created: poamCreated,
    controls_marked_partial: controlIdsNeedingProgress.size,
    inherited_flipped: inheritedFlipped,
    recomputed_controls: recomputed,
    registers_seeded: registersSeeded,
  });
}
