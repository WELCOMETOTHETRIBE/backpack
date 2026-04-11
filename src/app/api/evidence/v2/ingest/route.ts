import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlEvidenceLinks, controlRecords, osAssets } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

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
    controls: Array<{ control_id: string; evidence_files: string[] }>;
  };
  const map: Record<string, string[]> = {};
  for (const c of manifest.controls) {
    map[c.control_id] = c.evidence_files ?? [];
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
    const session = await auth();
    const user = session?.user as { organizationId?: string; id?: string } | undefined;
    const orgId = user?.organizationId;
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body", code: "PARSE_ERROR" }, { status: 400 });
    }

    const { manifest, boundary_id } = body as { manifest?: unknown; boundary_id?: string };

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

    // ── Duplicate run protection ─────────────────────────────────────────────
    const existingLinks = await db
      .select({ id: controlEvidenceLinks.id })
      .from(controlEvidenceLinks)
      .where(and(
        eq(controlEvidenceLinks.organizationId, orgId),
        eq(controlEvidenceLinks.runId, runId),
      ))
      .limit(1);

    if (existingLinks.length > 0) {
      return NextResponse.json({
        error: `run_id "${runId}" has already been ingested for this organization`,
        code: "DUPLICATE_RUN",
        run_id: runId,
      }, { status: 409 });
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

    // If no asset record exists, create a stub so evidence links have somewhere to point
    if (existingAsset.length === 0 && boundary_id) {
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

    // ── Audit log ─────────────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "v2_manifest_ingested",
      orgId,
      runId,
      computerName,
      collectedAt: m.collected_at,
      linksCreated,
      linkedControls: linkedControls.length,
      skippedControls: skippedControls.length,
      collectionErrors: collectionErrors.length,
      bundleValidation: m.bundle_validation ?? null,
    }));

    // ── Freshness summary ─────────────────────────────────────────────────────
    const ageMs = Date.now() - collectedAt.getTime();
    const ageDays = Math.floor(ageMs / MS_PER_DAY);
    const freshness = ageDays < STALE_DAYS ? "current" : ageDays < EXPIRY_DAYS ? "stale" : "expired";

    return NextResponse.json({
      run_id: runId,
      computer_name: computerName,
      collected_at: m.collected_at,
      links_created: linksCreated,
      linked_controls: linkedControls.length,
      skipped_controls: skippedControls.length,
      collection_errors: collectionErrors.length,
      collection_error_files: collectionErrors,
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
