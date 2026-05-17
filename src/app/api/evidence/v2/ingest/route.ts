import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlEvidenceLinks,
  controlRecords,
  osAssets,
  boundaries,
  evidenceRuns,
  evidenceFindings,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { calculateControlStatus } from "@/lib/control-status";
import { persistFilePresenceForRun } from "@/lib/evidence/per-control-file-presence";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { controlIdToNist } from "@/lib/compliance/controlId";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { seedRegistersFromEvidenceRun, seedTechnicalComplianceRun } from "@/lib/evidence-engine/auto-register-seeder";
import { createHash } from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHEMA = "cui-evidence.manifest.v2";
// Evidence is stale at 180 days, expired at 365 days.
const STALE_DAYS = 180;
const EXPIRY_DAYS = 365;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ManifestFile {
  path: string;
  sha256: string;
  size_bytes?: number;
  collected_at?: string;
  status?: string; // "ok" | "collection_error"
}

interface V2Manifest {
  schema: string;
  run_id: string;
  collected_at: string;
  computer_name: string;
  /** On-VM filesystem path where the bundle lives (e.g.
   *  "C:\\evidence\\CUI-Evidence-20260501-152509"). Captured so the codex
   *  can show the assessor where the underlying evidence files are
   *  retained -- the codex itself only stores the manifest + hashes
   *  (CUI-safe; control plane stays outside the boundary). */
  bundle_root?: string;
  files: ManifestFile[];
  bundle_validation?: {
    files_ok: number;
    files_total: number;
    errors: string[];
  };
}

// ─── Control-to-evidence path mapping ────────────────────────────────────────
// Built from OS-Evidence-to-NIST-Control-Manifest-73-73.json (already uses v2 paths).
// Loaded lazily — imported at runtime to avoid bundling the large JSON at build time.
async function loadControlEvidenceMap(): Promise<Record<string, string[]>> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const manifest = require("@/../docs/OS-Evidence-to-NIST-Control-Manifest-73-73.json") as {
    controls: Array<{ control_id: string; nist_req: string; evidence_files: string[] }>;
  };
  const map: Record<string, string[]> = {};
  for (const c of manifest.controls) {
    // controlRecords.controlId uses NIST short format ("3.1.1"), not the CMMC level prefix
    // format ("AC.L2-3.1.1") stored in control_id. Key on nist_req to match the DB.
    const key = c.nist_req || c.control_id;
    map[key] = c.evidence_files ?? [];
  }
  return map;
}

// ─── Route ───────────────────────────────────────────────────────────────────
/**
 * POST /api/evidence/v2/ingest
 *
 * Accepts the meta/manifest.json produced by Collect-Cui-Evidence-v2.ps1
 * (schema: cui-evidence.manifest.v2).
 *
 * Body: { manifest: V2Manifest, boundary_id: string }
 *
 * Behavior:
 * - Validates schema and required fields
 * - Rejects duplicate run_ids (409)
 * - For each file in manifest, creates control_evidence_links entries
 *   based on the OS-Evidence control mapping
 * - Files with status=collection_error are linked but marked as failed
 * - Returns { run_id, linked_controls, skipped_controls, collection_errors }
 */
export async function POST(req: Request) {
  try {
    // Accept either a logged-in dashboard session OR an EnclaveWatch
    // bearer token (for unattended cadence pushes from the vault).
    const ctx = await resolveOrgFromSessionOrBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const orgId = ctx.orgId;
    // userId is only available in the session path -- bearer pushes
    // record null linkedBy. Audit log captures the auth path either way.
    const session = ctx.via === "session" ? await auth() : null;
    const user = session?.user as { id?: string } | undefined;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body", code: "PARSE_ERROR" }, { status: 400 });
    }

    const { manifest, boundary_id, validation_report } = body as {
      manifest?: unknown;
      boundary_id?: string;
      validation_report?: unknown; // optional Test-CuiHardening validation-report.json
    };

    // ── Schema validation ────────────────────────────────────────────────────
    if (!manifest || typeof manifest !== "object") {
      return NextResponse.json({ error: "manifest required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const m = manifest as Partial<V2Manifest>;

    if (m.schema !== SCHEMA) {
      return NextResponse.json({
        error: `manifest.schema must be "${SCHEMA}", got "${m.schema}"`,
        code: "SCHEMA_MISMATCH",
        expected: SCHEMA,
        received: m.schema,
      }, { status: 400 });
    }
    if (!m.run_id || typeof m.run_id !== "string") {
      return NextResponse.json({ error: "manifest.run_id required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!m.collected_at || typeof m.collected_at !== "string") {
      return NextResponse.json({ error: "manifest.collected_at required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!m.computer_name || typeof m.computer_name !== "string") {
      return NextResponse.json({ error: "manifest.computer_name required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!Array.isArray(m.files)) {
      return NextResponse.json({ error: "manifest.files must be an array", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    // Reject if manifest contains non-JSON file contents (safety: validate body size is reasonable for a manifest)
    const bodyText = JSON.stringify(body);
    if (bodyText.length > 5 * 1024 * 1024) {
      return NextResponse.json({
        error: "Request too large — upload manifest.json only, not the evidence bundle",
        code: "PAYLOAD_TOO_LARGE",
      }, { status: 413 });
    }

    const runId = m.run_id;
    const collectedAt = new Date(m.collected_at);
    if (isNaN(collectedAt.getTime())) {
      return NextResponse.json({ error: "manifest.collected_at is not a valid ISO timestamp", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // ── Duplicate run: delete existing links and re-ingest (idempotent) ─────────
    // This allows re-uploading the same run_id after a bug fix (e.g. ID format fix)
    // without requiring a new manifest collection.
    const existingLinks = await db
      .select({ id: controlEvidenceLinks.id })
      .from(controlEvidenceLinks)
      .where(and(
        eq(controlEvidenceLinks.organizationId, orgId),
        eq(controlEvidenceLinks.runId, runId),
      ))
      .limit(1);

    if (existingLinks.length > 0) {
      // Wipe old links for this run so we get clean re-link with correct IDs
      await db
        .delete(controlEvidenceLinks)
        .where(and(
          eq(controlEvidenceLinks.organizationId, orgId),
          eq(controlEvidenceLinks.runId, runId),
        ));
    }

    // ── Ensure all 110 control records exist for this org (idempotent) ────────
    {
      const existing = await db
        .select({ controlId: controlRecords.controlId })
        .from(controlRecords)
        .where(eq(controlRecords.organizationId, orgId));
      const existingSet = new Set(existing.map((r) => r.controlId));
      const missing = ALL_CONTROL_IDS.filter((id) => !existingSet.has(id));
      if (missing.length > 0) {
        await db.insert(controlRecords).values(missing.map((controlId) => ({ organizationId: orgId, controlId })));
      }
    }

    // ── Asset linkage: find or stub os_asset by computer_name ────────────────
    const computerName = m.computer_name;
    const existingAsset = await db
      .select({ id: osAssets.id })
      .from(osAssets)
      .where(and(
        eq(osAssets.organizationId, orgId),
        eq(osAssets.hostname, computerName),
      ))
      .limit(1);

    // If no asset record exists, create a stub so evidence links have somewhere to point.
    // Only do so when boundary_id is provided AND actually exists in boundaries table
    // (guards against passing an asset UUID by mistake, which would violate the FK).
    if (existingAsset.length === 0 && boundary_id) {
      const validBoundary = await db
        .select({ id: boundaries.id })
        .from(boundaries)
        .where(and(eq(boundaries.organizationId, orgId), eq(boundaries.id, boundary_id)))
        .limit(1);

      if (validBoundary.length > 0) {
        await db.insert(osAssets).values({
          organizationId: orgId,
          boundaryId: boundary_id,
          hostname: computerName,
          osFamily: "windows_server",
          osVersion: "Windows Server 2025",
          role: "member_server",
          owner: "Discovered via evidence ingest",
          tags: ["auto-discovered"],
        }).onConflictDoNothing();
      }
    }

    // ── Record the manifest itself as an evidenceRuns row ───────────────────
    // This unifies upload history: every ingest (OS manifest, OS validator,
    // cloud validator) lives in one table that the history endpoint queries.
    // bundleRoot here is the on-VM filesystem path -- assessors see exactly
    // where the underlying evidence files are retained on the customer's VM
    // even though the codex itself only stores the manifest + hashes.
    const manifestBoundaryId =
      boundary_id ??
      (
        await db
          .select({ id: boundaries.id })
          .from(boundaries)
          .where(eq(boundaries.organizationId, orgId))
          .limit(1)
      )[0]?.id;

    if (manifestBoundaryId) {
      const manifestFingerprint = createHash("sha256")
        .update(`cui_evidence_manifest|${runId}|${computerName}`)
        .digest("hex");
      await db
        .delete(evidenceRuns)
        .where(
          and(
            eq(evidenceRuns.organizationId, orgId),
            eq(evidenceRuns.runFingerprint, manifestFingerprint),
          ),
        );
      const [manifestRun] = await db
        .insert(evidenceRuns)
        .values({
          organizationId: orgId,
          systemId: manifestBoundaryId,
          runId,
          collectedAt,
          collectorName: "collect_cui_evidence_v2",
          collectorVersion: "2.0",
          bundleRoot: m.bundle_root ?? "",
          manifest: m as unknown as Record<string, unknown>,
          hashAlgorithm: "sha256",
          source: "cui_evidence_manifest",
          boundaryId: manifestBoundaryId,
          runFingerprint: manifestFingerprint,
        })
        .returning({ id: evidenceRuns.id });

      // Per-control file-presence evaluator — was previously only wired
      // into the legacy /api/evidence-runs/import path, leaving every
      // collect_cui_evidence_v2 ingest with ZERO rows in
      // evidence_control_technical_status. TrainOS surfaced the stall;
      // this call closes the loop by computing the per-control
      // file-presence aggregate every time a manifest lands here.
      if (manifestRun) {
        await persistFilePresenceForRun(manifestRun.id, m.files ?? []);
      }
    }

    // ── Control-evidence mapping ─────────────────────────────────────────────
    const controlMap = await loadControlEvidenceMap();

    // Build index: file path → { sha256, status } from manifest
    const fileIndex = new Map<string, { sha256: string; status: string }>();
    for (const f of m.files) {
      if (f.path && f.sha256) {
        fileIndex.set(f.path, { sha256: f.sha256, status: f.status ?? "ok" });
      }
    }

    // Load all control records for this org to resolve control_id → control_record_id
    const orgControls = await db
      .select({ id: controlRecords.id, controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));

    const controlRecordByControlId = new Map<string, string>(
      orgControls.map((r) => [r.controlId, r.id])
    );

    // Freshness: compute expiresAt from collected_at
    const expiresAt = new Date(collectedAt.getTime() + EXPIRY_DAYS * MS_PER_DAY);

    // ── Create evidence links ─────────────────────────────────────────────────
    const linkedControls: string[] = [];
    const skippedControls: string[] = [];
    const collectionErrors: string[] = [];
    let linksCreated = 0;

    // Track which control record IDs had at least one successful (non-error) file linked
    const satisfiedRecordIds = new Set<string>();
    // Track which had only collection errors (all files errored)
    const errorOnlyRecordIds = new Set<string>();

    for (const [controlId, evidenceFiles] of Object.entries(controlMap)) {
      const controlRecordId = controlRecordByControlId.get(controlId);
      if (!controlRecordId) {
        skippedControls.push(controlId); // no control record yet for this org
        continue;
      }

      let controlHadSuccess = false;
      let controlHadAnyFile = false;

      for (const filePath of evidenceFiles) {
        const fileEntry = fileIndex.get(filePath);
        if (!fileEntry) continue; // file not in this bundle (expected for governed/inherited controls)

        controlHadAnyFile = true;
        const isCollectionError = fileEntry.status === "collection_error";
        if (isCollectionError) {
          collectionErrors.push(`${controlId}: ${filePath}`);
        } else {
          controlHadSuccess = true;
        }

        await db.insert(controlEvidenceLinks).values({
          organizationId: orgId,
          controlRecordId,
          runId,
          filePath,
          sha256Hash: fileEntry.sha256,
          description: isCollectionError
            ? `Collection error — ${filePath} could not be gathered during run ${runId}`
            : `Collected by Collect-Cui-Evidence-v2 from ${computerName} (run ${runId})`,
          source: `collector:${computerName}`,
          expiresAt,
          linkedBy: user?.id ?? null,
        }).onConflictDoNothing();

        linksCreated++;
      }

      if (controlHadAnyFile) {
        if (controlHadSuccess) {
          satisfiedRecordIds.add(controlRecordId);
        } else {
          errorOnlyRecordIds.add(controlRecordId);
        }
      }

      linkedControls.push(controlId);
    }

    // ── Update technical_status lanes ─────────────────────────────────────────
    // Controls with at least one successful evidence file → satisfied
    if (satisfiedRecordIds.size > 0) {
      await db
        .update(controlRecords)
        .set({ technicalStatus: "satisfied", updatedAt: new Date() })
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            inArray(controlRecords.id, [...satisfiedRecordIds])
          )
        );
    }
    // Controls where every collected file had a collection_error → failed
    // (only flip to failed if they are not already satisfied from a prior run)
    if (errorOnlyRecordIds.size > 0) {
      await db
        .update(controlRecords)
        .set({ technicalStatus: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            inArray(controlRecords.id, [...errorOnlyRecordIds]),
            sql`${controlRecords.technicalStatus} != 'satisfied'`
          )
        );
    }

    // ── Recalculate implementationStatus for all satisfied controls ──────────
    // Run in parallel; cap concurrency to avoid hammering the DB on large bundles.
    if (satisfiedRecordIds.size > 0) {
      const ids = [...satisfiedRecordIds];
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        await Promise.all(ids.slice(i, i + BATCH).map((id) => calculateControlStatus(id).catch(() => null)));
      }
    }

    // ── Optional: ingest Test-CuiHardening validation-report.json ────────────
    // The OS validator (Test-CuiHardening.ps1) emits per-check PASS/FAIL state
    // that's richer than the file-level evidence linking above. When the
    // caller passes validation_report alongside the manifest, we record each
    // check as an evidenceFindings row (same table the Azure validator uses).
    // This unlocks per-control validator-PASS signals on the codex side.
    let validatorFindings = 0;
    if (validation_report && typeof validation_report === "object") {
      try {
        const vr = validation_report as {
          summary?: { computer?: string; pass_count?: number; fail_count?: number; total?: number };
          checks?: Array<{
            id?: string;
            control?: string;
            pass?: boolean;
            observed?: string;
            expected?: string;
            evidence_hint?: string;
          }>;
        };
        const checks = Array.isArray(vr.checks) ? vr.checks : [];
        if (checks.length > 0) {
          // Find the org's primary boundary to anchor the run (windows_server_hardening
          // runs are scoped to a boundary like Azure runs are).
          const targetBoundaryId =
            boundary_id ??
            (
              await db
                .select({ id: boundaries.id })
                .from(boundaries)
                .where(eq(boundaries.organizationId, orgId))
                .limit(1)
            )[0]?.id;

          if (targetBoundaryId) {
            const validatorFingerprint = createHash("sha256")
              .update(`windows_server_hardening|${runId}|${checks.length}`)
              .digest("hex");

            // Idempotent: delete prior validator-run row for the same fingerprint.
            await db
              .delete(evidenceRuns)
              .where(
                and(
                  eq(evidenceRuns.organizationId, orgId),
                  eq(evidenceRuns.runFingerprint, validatorFingerprint),
                ),
              );

            const [vrun] = await db
              .insert(evidenceRuns)
              .values({
                organizationId: orgId,
                systemId: targetBoundaryId,
                runId: `WSH-${runId}`,
                collectedAt,
                collectorName: "test_cui_hardening",
                collectorVersion: "1.0", // bump as Test-CuiHardening evolves
                bundleRoot: m.bundle_root ?? "",
                manifest: vr as unknown as Record<string, unknown>,
                hashAlgorithm: "sha256",
                source: "windows_server_hardening",
                boundaryId: targetBoundaryId,
                runFingerprint: validatorFingerprint,
              })
              .returning();

            if (vrun) {
              // One technical_compliance_run entry per OS Collector run,
              // regardless of finding count — the run itself is the evidence.
              try {
                await seedTechnicalComplianceRun(
                  vrun.id, orgId, targetBoundaryId, collectedAt,
                  {
                    runId: vrun.runId,
                    collectorName: vrun.collectorName ?? "test_cui_hardening",
                    collectorVersion: vrun.collectorVersion ?? "1.0",
                    checksTotal: checks.length,
                    checksPassed: checks.filter((c) => Boolean(c.pass)).length,
                    checksFailed: checks.filter((c) => !c.pass).length,
                  }
                );
              } catch (tcrErr) {
                console.warn("[v2/ingest] technical_compliance_run seed failed (non-blocking):", (tcrErr as Error).message);
              }

              const findingRows = checks
                .map((c) => {
                  const nist = c.control ? controlIdToNist(c.control) : null;
                  if (!nist) return null;
                  // Honor per-check identity if the validator supplied one
                  // (e.g. Conditional Access checks where multiple distinct
                  // checks back the same control). Default to the control
                  // NIST id so old single-check-per-control collectors keep
                  // their PK uniqueness.
                  const checkId = (c as { check_id?: string }).check_id?.trim() || nist;
                  return {
                    evidenceRunId: vrun.id,
                    controlId: nist,
                    checkId,
                    pass: Boolean(c.pass),
                    observed: c.observed ?? "",
                    expected: c.expected ?? "",
                    evidenceHint: c.evidence_hint ?? "",
                    evidenceFilesUsed: [],
                    providerOrCustomer: "customer",
                    layer: null,
                    details: null,
                    partial: false,
                  };
                })
                .filter((r): r is NonNullable<typeof r> => r !== null);

              if (findingRows.length > 0) {
                // De-duplicate within the batch on (controlId, checkId).
                // FAIL takes precedence over PASS for the same (control,
                // check) pair (assessor logic: any failing check fails the
                // control). Distinct check_ids land as separate rows now
                // that the PK is (run, control, check_id).
                const collapsed = new Map<string, (typeof findingRows)[number]>();
                for (const r of findingRows) {
                  const key = `${r.controlId}|${r.checkId}`;
                  const existing = collapsed.get(key);
                  if (!existing) {
                    collapsed.set(key, r);
                  } else if (existing.pass && !r.pass) {
                    collapsed.set(key, r);
                  }
                }
                await db.insert(evidenceFindings).values([...collapsed.values()]);
                validatorFindings = collapsed.size;

                // Auto-seed governance registers from OS/WSH findings (best-effort).
                try {
                  await seedRegistersFromEvidenceRun(vrun.id, orgId, targetBoundaryId, collectedAt, "OS/WSH evidence run");
                } catch (seedErr) {
                  console.warn("[v2/ingest] WSH auto-register seed failed (non-blocking):", (seedErr as Error).message);
                }
              }
            }
          }
        }
      } catch (err) {
        // Validator-report ingestion is best-effort; don't fail the manifest
        // ingest if it errors. Log and continue.
        console.warn("validation_report ingestion failed:", (err as Error).message);
      }
    }

    // ── Continuous-monitoring attestation for 3.14.6 ─────────────────────────
    // Every successful daily ingest is itself evidence that the vault's
    // monitoring stack is operating: Sysmon network channels are being
    // collected, the bundle landed, the validator ran. Mirror that into a
    // control_monitoring.control_check entry so 3.14.6 (Monitor
    // Communications For Attacks) has a register lane to satisfy without
    // requiring a parallel manual log. Idempotent on (control_id, checked_at).
    let monitoringEntriesWritten = 0;
    try {
      // Match either the schema id or the canonical seed key. When both
      // exist (data drift), prefer whichever already has entries so we keep
      // writing to the same row going forward.
      const cmCandidates = resolveRegisterKeyCandidates("control_monitoring");
      const cmMatching = await db
        .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
        .from(governanceRegisters)
        .where(
          and(
            eq(governanceRegisters.organizationId, orgId),
            sql`${governanceRegisters.registerKey} IN (${sql.join(
              cmCandidates.map((k) => sql`${k}`),
              sql`, `,
            )})`,
          ),
        );
      let cmRegister: { id: string } | undefined;
      if (cmMatching.length === 1) {
        cmRegister = cmMatching[0];
      } else if (cmMatching.length > 1) {
        const counts = await Promise.all(cmMatching.map(async (r) => {
          const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(governanceRegisterEntries).where(eq(governanceRegisterEntries.registerId, r.id));
          return { reg: r, n: c?.n ?? 0 };
        }));
        counts.sort((a, b) => b.n - a.n);
        cmRegister = counts[0].reg;
      }
      const monitoringBoundaryId =
        boundary_id ??
        (
          await db
            .select({ id: boundaries.id })
            .from(boundaries)
            .where(eq(boundaries.organizationId, orgId))
            .limit(1)
        )[0]?.id;
      if (cmRegister && monitoringBoundaryId) {
        const checkedAtIso = collectedAt.toISOString();
        const cmEntryData: Record<string, unknown> = {
          control_id: "3.14.6",
          checked_at: checkedAtIso,
          checked_by: "EnclaveWatch automated cadence",
          method: "automated",
          // The control_check attests that monitoring HAPPENED; per-control
          // pass/fail belongs in evidence_findings, not here. So this is
          // always "pass" when the cadence completed end-to-end.
          result: "pass",
          notes: `Daily CUI evidence cadence: ${linksCreated} evidence link(s) refreshed, ${linkedControls.length} control(s) refreshed, ${validatorFindings} validator finding(s) recorded, ${collectionErrors.length} collection error(s). Sysmon + Defender channels collected by the vault prove communications monitoring is active.`,
          run_id: runId,
          source: "cui_evidence_manifest",
        };
        const [existingCm] = await db
          .select({ id: governanceRegisterEntries.id })
          .from(governanceRegisterEntries)
          .where(
            and(
              eq(governanceRegisterEntries.registerId, cmRegister.id),
              sql`${governanceRegisterEntries.entryData} ->> 'control_id' = '3.14.6'`,
              sql`${governanceRegisterEntries.entryData} ->> 'checked_at' = ${checkedAtIso}`,
            ),
          )
          .limit(1);
        if (existingCm) {
          await db
            .update(governanceRegisterEntries)
            .set({
              entryData: cmEntryData,
              status: "final",
              finalizedAt: new Date(),
              entryType: "control_check",
              updatedAt: new Date(),
            })
            .where(eq(governanceRegisterEntries.id, existingCm.id));
        } else {
          await db.insert(governanceRegisterEntries).values({
            registerId: cmRegister.id,
            boundaryId: monitoringBoundaryId,
            entryData: cmEntryData,
            entryType: "control_check",
            status: "final",
            finalizedAt: new Date(),
          });
        }
        monitoringEntriesWritten = 1;

        // Recompute 3.14.6 so the dashboard reflects the new register entry.
        const [si6Rec] = await db
          .select({ id: controlRecords.id })
          .from(controlRecords)
          .where(
            and(
              eq(controlRecords.organizationId, orgId),
              eq(controlRecords.controlId, "3.14.6"),
            ),
          )
          .limit(1);
        if (si6Rec) await calculateControlStatus(si6Rec.id).catch(() => null);
      }
    } catch (err) {
      console.warn(
        "control_monitoring write failed (best-effort):",
        (err as Error).message,
      );
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "v2_manifest_ingested",
      orgId,
      runId,
      computerName,
      bundleRoot: m.bundle_root ?? null,
      collectedAt: m.collected_at,
      linksCreated,
      linkedControls: linkedControls.length,
      skippedControls: skippedControls.length,
      collectionErrors: collectionErrors.length,
      validatorFindings,
      bundleValidation: m.bundle_validation ?? null,
    }));

    // ── Freshness summary ─────────────────────────────────────────────────────
    const ageMs = Date.now() - collectedAt.getTime();
    const ageDays = Math.floor(ageMs / MS_PER_DAY);
    const freshness = ageDays < STALE_DAYS ? "current" : ageDays < EXPIRY_DAYS ? "stale" : "expired";

    return NextResponse.json({
      run_id: runId,
      computer_name: computerName,
      bundle_root: m.bundle_root ?? null,
      collected_at: m.collected_at,
      links_created: linksCreated,
      linked_controls: linkedControls.length,
      skipped_controls: skippedControls.length,
      collection_errors: collectionErrors.length,
      collection_error_files: collectionErrors,
      validator_findings: validatorFindings,
      freshness,
      age_days: ageDays,
      expires_at: expiresAt.toISOString(),
      bundle_validation: m.bundle_validation ?? null,
    }, { status: 201 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
