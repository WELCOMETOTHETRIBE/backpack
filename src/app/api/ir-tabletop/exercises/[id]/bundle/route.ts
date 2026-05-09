import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { and, desc, eq, inArray } from "drizzle-orm"
import { createHash, randomBytes } from "node:crypto"

/**
 * RFC 4122 uuid shape (any version). Used to gate cross-system IDs that
 * arrive on the bundle payload — cuids and synthetic ids pass the bridge
 * zod regex but must be coerced to null before any uuid-typed FK INSERT,
 * so a Postgres "invalid input syntax for type uuid" doesn't blow up
 * the archive transaction.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(s: string | null | undefined): s is string {
  return typeof s === "string" && UUID_RE.test(s)
}

/**
 * Map a free-form participant role string from a TrainOS payload to one
 * of the ir_participant_role enum values. TrainOS surfaces job titles
 * ("ISSO", "CISO", "VP Eng", etc.) while Codex's enum is a small
 * controlled set. We do a best-effort match — exact enum value first,
 * then a synonym table for common abbreviations, then "other" as a safe
 * default. The original string is preserved in
 * ir_exercise_bundles.attestation_basis_json so the audit trail keeps
 * the verbatim title an auditor would expect to see.
 */
const ROLE_ENUM_VALUES = [
  "facilitator",
  "approver",
  "executive",
  "it_admin",
  "program_manager",
  "security_lead",
  "mactech_support",
  "observer",
  "other",
] as const
type ParticipantRole = (typeof ROLE_ENUM_VALUES)[number]

function mapParticipantRole(raw: string | null | undefined): ParticipantRole {
  if (!raw) return "other"
  const norm = raw.trim().toLowerCase().replace(/[\s-]+/g, "_")
  if ((ROLE_ENUM_VALUES as readonly string[]).includes(norm)) {
    return norm as ParticipantRole
  }
  // Common job-title aliases → enum values.
  const aliases: Record<string, ParticipantRole> = {
    isso: "security_lead",
    iso: "security_lead",
    ciso: "security_lead",
    "security_officer": "security_lead",
    "system_administrator": "it_admin",
    sysadmin: "it_admin",
    devops: "it_admin",
    "it_staff": "it_admin",
    pm: "program_manager",
    "project_manager": "program_manager",
    ceo: "executive",
    cto: "executive",
    cio: "executive",
    coo: "executive",
    "vp": "executive",
    "vp_eng": "executive",
    "vp_engineering": "executive",
    "vp_security": "security_lead",
    director: "executive",
    "mactech": "mactech_support",
    "mactech_engineer": "mactech_support",
  }
  return aliases[norm] ?? "other"
}
import { db } from "@/db"
import {
  controlRecords,
  evidenceFiles,
  evidenceRuns,
  governanceArtifactCompletions,
  irAars,
  irCorrectiveActions,
  irExerciseBundles,
  irExerciseControls,
  irExerciseParticipants,
  irExercises,
  irFindings,
  irInjectResponses,
  irParticipantDisputes,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
  UploadBundleManifestSchema,
} from "@/lib/ir-tabletop-bridge"
import { controlIdToNist } from "@/lib/compliance/controlId"
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger"
import { getIrTabletopStorage } from "@/lib/ir-tabletop-storage"
import {
  emitPoamFromBundle,
  type FindingForEmission,
} from "@/lib/ir-tabletop-poam-emission"
import { sendIrParticipantDisputeNotifications } from "@/lib/ir-tabletop-dispute-email"

/**
 * Capture a full state snapshot for the exercise at archive time.
 * Returns a JSON-serializable object with every input the bundle's documents
 * were generated from. Stored on ir_exercise_bundles.archived_state_snapshot_json.
 */
async function snapshotExerciseState(exerciseId: string) {
  const [exercise, participants, controls, injectResponses, aar] =
    await Promise.all([
      db
        .select()
        .from(irExercises)
        .where(eq(irExercises.id, exerciseId))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select()
        .from(irExerciseParticipants)
        .where(eq(irExerciseParticipants.exerciseId, exerciseId)),
      db
        .select()
        .from(irExerciseControls)
        .where(eq(irExerciseControls.exerciseId, exerciseId)),
      db
        .select()
        .from(irInjectResponses)
        .where(eq(irInjectResponses.exerciseId, exerciseId)),
      db
        .select()
        .from(irAars)
        .where(eq(irAars.exerciseId, exerciseId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ])

  let findings: Array<
    typeof irFindings.$inferSelect & {
      correctiveActions: (typeof irCorrectiveActions.$inferSelect)[]
    }
  > = []
  if (aar) {
    const rawFindings = await db
      .select()
      .from(irFindings)
      .where(eq(irFindings.aarId, aar.id))
    const findingIds = rawFindings.map((f) => f.id)
    const cars =
      findingIds.length > 0
        ? await db
            .select()
            .from(irCorrectiveActions)
            .where(inArray(irCorrectiveActions.findingId, findingIds))
        : []
    const carsByFinding = new Map<string, typeof cars>()
    for (const c of cars) {
      const list = carsByFinding.get(c.findingId) ?? []
      list.push(c)
      carsByFinding.set(c.findingId, list)
    }
    findings = rawFindings.map((f) => ({
      ...f,
      correctiveActions: carsByFinding.get(f.id) ?? [],
    }))
  }

  return {
    archivedAt: new Date().toISOString(),
    snapshotVersion: "ir-tabletop-state.v1",
    exercise,
    participants,
    controls,
    injectResponses,
    aar,
    findings,
  }
}

/**
 * GET /api/ir-tabletop/exercises/:id/bundle
 *
 * Returns archived bundles for the exercise (most recent version first).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeIrRequest(req, "")
    const { id } = await params

    const exercise = (
      await db
        .select({ id: irExercises.id })
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!exercise) {
      // Strict-by-id: this endpoint does NOT auto-create the exercise.
      // Surface the specific cause so callers (TrainOS, future
      // integrations) don't have to round-trip to diagnose. Pre-register
      // the exercise via POST /api/ir-tabletop/exercises first.
      return NextResponse.json(
        {
          error: "exercise_not_registered",
          message:
            "No ir_exercises row exists with the given id under your org. Pre-register the exercise via POST /api/ir-tabletop/exercises (returns the canonical id) before archiving a bundle against it.",
          exerciseId: id,
          orgId: auth.organizationId,
        },
        { status: 404 }
      )
    }

    const bundles = await db
      .select()
      .from(irExerciseBundles)
      .where(eq(irExerciseBundles.exerciseId, id))
      .orderBy(desc(irExerciseBundles.bundleVersion))
    return NextResponse.json(bundles)
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

/**
 * POST /api/ir-tabletop/exercises/:id/bundle
 *
 * Archives a generated bundle's manifest in control-plane. Creates:
 *  - one evidence_run (source='ir_tabletop', system_id=exercise_id) with
 *    run_fingerprint=manifestSha256 (provides cross-org idempotency)
 *  - one evidence_file row per manifest entry
 *  - one ir_exercise_bundles row linking the run + manifest
 *
 * Idempotent: re-uploading the same manifest (same SHA-256) returns the
 * existing bundle row instead of duplicating it.
 *
 * Phase 6a stores manifest only — bytes remain training-side and are
 * regeneratable from immutable inputs (scenario snapshot + exercise + AAR
 * data). Phase 7 will add blob storage for full byte archival.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = UploadBundleManifestSchema.parse(JSON.parse(rawBody))

    // Defense-in-depth host inspection on vaultStorageUri.
    //
    // Cases:
    //   (a) host ends in .usgovcloudapi.net   → green path, no log
    //   (b) host ends in .blob.core.windows.net AND
    //       CODEX_ALLOW_COMMERCIAL_AZURE_FOR_DEV=true → PILOT BYPASS
    //       (zod skipped its reject). Loud warn + audit-log breadcrumb so
    //       a C3PAO can later grep "pilot bypass active for these N
    //       bundles". Removed once MacTech's Gov subscription lands.
    //   (c) host neither Gov nor commercial Azure → warn (don't reject).
    //       Catches private clouds / dev proxies / misconfigured endpoints.
    //   (d) host ends in .blob.core.windows.net AND no bypass flag →
    //       already rejected by zod with HTTP 400. Unreachable here.
    let pilotBypassActive = false
    if (body.vaultStorageUri) {
      try {
        const host = new URL(body.vaultStorageUri).host.toLowerCase()
        if (host.endsWith(".blob.core.windows.net")) {
          // Case (b): pilot bypass active.
          pilotBypassActive = true
          console.warn(
            "[ir-bundle] PILOT BYPASS — commercial Azure URL accepted (CODEX_ALLOW_COMMERCIAL_AZURE_FOR_DEV=true). NOT C3PAO-defensible for production CUI bundles.",
            JSON.stringify({
              exerciseId: id,
              host,
              uri: body.vaultStorageUri,
              orgId: auth.organizationId,
            })
          )
        } else if (!host.endsWith(".usgovcloudapi.net")) {
          // Case (c): non-Gov, non-commercial-Azure — log to surface misconfig.
          console.warn(
            "[ir-bundle] vault_storage_uri host is not Azure Gov",
            JSON.stringify({
              exerciseId: id,
              host,
              uri: body.vaultStorageUri,
              orgId: auth.organizationId,
            })
          )
        }
      } catch {
        /* zod's URL validation already ran; unreachable */
      }
    }

    const exercise = (
      await db
        .select()
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!exercise) {
      // Strict-by-id: this endpoint does NOT auto-create the exercise.
      // Surface the specific cause so callers (TrainOS, future
      // integrations) don't have to round-trip to diagnose. Pre-register
      // the exercise via POST /api/ir-tabletop/exercises first.
      return NextResponse.json(
        {
          error: "exercise_not_registered",
          message:
            "No ir_exercises row exists with the given id under your org. Pre-register the exercise via POST /api/ir-tabletop/exercises (returns the canonical id) before archiving a bundle against it.",
          exerciseId: id,
          orgId: auth.organizationId,
        },
        { status: 404 }
      )
    }

    // ─── Cadence enforcement (Codex migration 0065 step 3) ─────────────────
    // AT.L2-3.6.3 requires the IR capability to be tested on a defined
    // frequency. The C3PAO position: an AAR older than 12 months is stale
    // — the exercise needs to be re-run, not re-uploaded. Enforce only
    // when the bundle ships executedAt; legacy (pre-augmentation) bundles
    // without executedAt fall through and rely on existing cadence math.
    const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000
    if (body.executedAt) {
      const ageMs = Date.now() - new Date(body.executedAt).getTime()
      if (ageMs > TWELVE_MONTHS_MS) {
        return NextResponse.json(
          {
            error: "bundle_stale",
            message: `Exercise executedAt is more than 12 months old (${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days). C3PAO requires AT.L2-3.6.3 testing on a defined frequency — re-run the tabletop and upload a fresh bundle.`,
            executedAt: body.executedAt,
            maxAgeMonths: 12,
          },
          { status: 422 }
        )
      }
      if (ageMs < 0) {
        return NextResponse.json(
          {
            error: "bundle_future_dated",
            message:
              "Exercise executedAt is in the future. Reject — possible clock skew or bad data.",
            executedAt: body.executedAt,
          },
          { status: 422 }
        )
      }
    }

    // ─── Live-proof enforcement (Codex migration 0065 step 3) ──────────────
    // Bundle claims AT.L2-3.6.3 satisfaction (testing) only when there's
    // evidence of live execution: facilitator-attested participants AND
    // attendance corroboration beyond the facilitator's word (Teams CSV
    // OR signed roster image). Without those, the bundle is a paper
    // walkthrough — accept it, but the bundle's irCoverage flag will
    // tell Codex to stamp it as facilitator_only and 3.6.3 stays
    // in_progress. We don't reject in this case (3.6.1 capability
    // satisfaction is still valid). Reject only if a partial signal
    // is present (e.g. claims 'teams_csv' corroboration but didn't
    // include the file's sha256).
    if (
      body.attendanceCorroborationKind &&
      body.attendanceCorroborationKind !== "facilitator_only" &&
      !body.attendanceCorroborationFileSha256
    ) {
      return NextResponse.json(
        {
          error: "live_proof_incomplete",
          message: `Bundle claims '${body.attendanceCorroborationKind}' corroboration but no attendanceCorroborationFileSha256 was supplied. Either include the corroboration file's sha256 or set kind to 'facilitator_only' (3.6.1 only).`,
        },
        { status: 422 }
      )
    }

    // Idempotency: check for existing run with same fingerprint (manifestSha256).
    const existingRun = (
      await db
        .select()
        .from(evidenceRuns)
        .where(
          and(
            eq(evidenceRuns.organizationId, auth.organizationId),
            eq(evidenceRuns.runFingerprint, body.manifestSha256)
          )
        )
        .limit(1)
    )[0]
    if (existingRun) {
      const existingBundle = (
        await db
          .select()
          .from(irExerciseBundles)
          .where(eq(irExerciseBundles.evidenceRunId, existingRun.id))
          .limit(1)
      )[0]
      if (existingBundle) {
        return NextResponse.json(
          { alreadyArchived: true, bundle: existingBundle },
          { status: 200 }
        )
      }
    }

    // Capture state snapshot BEFORE the transaction so the snapshot is
    // independent of in-flight schema state. The snapshot is the assessment-
    // grade record of "what was tested" — frozen forever from this point.
    const stateSnapshot = await snapshotExerciseState(id)

    // ─── Snapshot consistency check (migration 0065, warn mode) ────────────
    // If TrainOS sent its own snapshot in the manifest, compare to the
    // server-built one we just captured. Divergence = drift between
    // TrainOS's view and Codex's view; logs a warning today, will reject
    // strictly in a later phase. Compares only the row counts and key ids
    // — full deep-equality is too brittle while the contract evolves.
    const incomingSnapshot = (body.manifest?.archivedStateSnapshotJson ??
      body.manifest?.archived_state_snapshot_json) as
      | { participants?: unknown[]; findings?: unknown[]; injectResponses?: unknown[] }
      | undefined
    if (incomingSnapshot) {
      const counts = {
        server: {
          participants: stateSnapshot.participants.length,
          findings: stateSnapshot.findings.length,
          injectResponses: stateSnapshot.injectResponses.length,
        },
        bundle: {
          participants: incomingSnapshot.participants?.length ?? 0,
          findings: incomingSnapshot.findings?.length ?? 0,
          injectResponses: incomingSnapshot.injectResponses?.length ?? 0,
        },
      }
      const diverged =
        counts.server.participants !== counts.bundle.participants ||
        counts.server.findings !== counts.bundle.findings ||
        counts.server.injectResponses !== counts.bundle.injectResponses
      if (diverged) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ir-bundle/snapshot-divergence] exercise=${id} server=${JSON.stringify(counts.server)} bundle=${JSON.stringify(counts.bundle)}`,
        )
      }
    }

    // ─── Anchor chain (migration 0065) ─────────────────────────────────────
    // Each bundle's anchor_hash is sha256(bundleSha || manifestSha ||
    // executedAt || tenantId || prevAnchorHash). Chains every bundle for
    // an org so byte-level tampering between archive and audit can be
    // detected by replaying the chain. The "prev" is the most recent
    // bundle for the SAME org (across exercises) — if none exists, prev
    // is the empty string (chain root). Computed before the transaction
    // so the value can be persisted on the bundle row in one shot.
    const [prevBundle] = await db
      .select({ anchorHash: irExerciseBundles.anchorHash })
      .from(irExerciseBundles)
      .innerJoin(evidenceRuns, eq(evidenceRuns.id, irExerciseBundles.evidenceRunId))
      .where(eq(evidenceRuns.organizationId, auth.organizationId))
      .orderBy(desc(irExerciseBundles.createdAt))
      .limit(1)
    const prevAnchorHash = prevBundle?.anchorHash ?? ""
    const executedAtIso = body.executedAt ?? new Date().toISOString()
    const validThroughIso = new Date(
      new Date(executedAtIso).getTime() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString()
    // 7-day dispute window — bundle stays "provisional" until then.
    const attendanceSealAtIso = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const anchorHash = createHash("sha256")
      .update(body.bundleSha256)
      .update("|")
      .update(body.manifestSha256)
      .update("|")
      .update(executedAtIso)
      .update("|")
      .update(auth.organizationId)
      .update("|")
      .update(prevAnchorHash)
      .digest("hex")

    // Phase 8 byte archival: if the caller included the ZIP bytes, store them
    // via the configured driver before opening the DB transaction. The
    // returned storage key gets persisted on the bundle row. Failure here
    // aborts the archive so we never have a manifest pointing at missing bytes.
    let resolvedStoragePrefix = body.storagePrefix ?? null
    let bytesArchived = false
    let storageDriver: string | null = null
    if (body.bundleZipBase64) {
      const zipBytes = Buffer.from(body.bundleZipBase64, "base64")
      if (zipBytes.length === 0) {
        return NextResponse.json(
          { error: "bundleZipBase64 decoded to zero bytes" },
          { status: 400 }
        )
      }
      const storage = getIrTabletopStorage()
      const result = await storage.putBundle({
        organizationId: auth.organizationId,
        exerciseId: id,
        bundleVersion: body.bundleVersion,
        bytes: zipBytes,
        contentType: "application/zip",
      })
      resolvedStoragePrefix = result.storageKey
      bytesArchived = true
      storageDriver = storage.driverName
    }

    const result = await db.transaction(async (tx) => {
      const runId = `IR-Tabletop-${id}-v${body.bundleVersion}-${Date.now()}`
      const [run] = await tx
        .insert(evidenceRuns)
        .values({
          organizationId: auth.organizationId,
          systemId: id, // treat the exercise as the "system under test"
          runId,
          collectedAt: new Date(),
          collectorName: "mactech-training",
          collectorVersion: "phase7.v1",
          bundleRoot: `${runId}/`,
          manifest: body.manifest,
          hashAlgorithm: "sha256",
          source: "ir_tabletop",
          boundaryId: exercise.boundaryId,
          runFingerprint: body.manifestSha256,
        })
        .returning()

      await tx.insert(evidenceFiles).values(
        body.files.map((f) => ({
          evidenceRunId: run.id,
          path: f.filename,
          sha256: f.sha256,
          sizeBytes: f.sizeBytes,
        }))
      )

      const [bundle] = await tx
        .insert(irExerciseBundles)
        .values({
          exerciseId: id,
          evidenceRunId: run.id,
          bundleVersion: body.bundleVersion,
          manifestJson: body.manifest,
          manifestSha256: body.manifestSha256,
          timestampToken: body.timestampToken ?? null,
          timestampedAt: body.timestampedAt
            ? new Date(body.timestampedAt)
            : new Date(),
          retentionUntil: exercise.retentionUntil,
          generatedByUserId: auth.userId,
          storagePrefix: resolvedStoragePrefix,
          archivedStateSnapshotJson: stateSnapshot,
          // ── Migration 0065: IR satisfaction hardening ──
          bundleSha256: body.bundleSha256,
          vaultStorageUri: body.vaultStorageUri ?? null,
          vaultStorageRegion: body.vaultStorageRegion ?? null,
          // Accept either bytesPersisted (original field name) or
// vaultBytesPersisted (TrainOS rename). vaultBytesPersisted wins
// when both are sent — it's closer to the post-upload truth.
bytesPersisted: body.vaultBytesPersisted ?? body.bytesPersisted ?? false,
          executedAt: new Date(executedAtIso),
          validThroughAt: new Date(validThroughIso),
          attestationBasisJson: body.attestationBasis ?? null,
          attendanceCorroborationKind: body.attendanceCorroborationKind ?? null,
          attendanceCorroborationFileSha256:
            body.attendanceCorroborationFileSha256 ?? null,
          attendanceSealAt: new Date(attendanceSealAtIso),
          bundleState: "provisional",
          anchorHash,
          prevAnchorHash: prevAnchorHash || null,
        })
        .returning()

      // ─── Auto-attach governance_artifact_completions to linked controls ──
      // For every NIST control linked to this exercise via ir_exercise_controls,
      // upsert a governance_artifact_completion row (Lane 4 evidence) so the
      // Outstanding Controls Wizard can flip 3.6.1/3.6.2/3.6.3 to "closed"
      // automatically once the bundle is archived. Adjacent controls (AU/AC/
      // CP/SI marked is_primary=false) also get attached because the AAR
      // demonstrably exercised them — but they only flip if other lane
      // requirements are also met (handled by isControlAdjudicated()).
      const linkedControls = await tx
        .select({ controlId: irExerciseControls.controlId })
        .from(irExerciseControls)
        .where(eq(irExerciseControls.exerciseId, id))

      // Per-objective objective ids carried by the bundle's manifest, e.g.:
      //   { "3.6.3": ["[a]", "[b]", "[c]"], "3.6.1": ["[a]", "[b]"] }
      // If absent, fall back to one whole-control completion per linked
      // control (legacy behavior, objective_id=null).
      const objectivesPerControl =
        (body.manifest?.objectivesPerControl as
          | Record<string, string[]>
          | undefined) ?? {}

      const completionInserts: {
        controlId: string
        objectiveId: string | null
        completionId: string
      }[] = []
      for (const link of linkedControls) {
        // ir_exercise_controls.controlId stores the CMMC display form
        // ("IR.L2-3.6.1") because that's what the TrainOS bridge schema
        // accepts. control_records.controlId is canonically NIST form
        // ("3.6.1") — every other surface (SCTM list, adjudication helpers,
        // outstanding-bucket counts, evidence/findings) keys on the NIST
        // shape. Normalize before the lookup/insert so we don't create
        // orphan "IR.L2-3.6.1" rows alongside the canonical "3.6.1" row,
        // which would surface as duplicate NOT STARTED rows on /dashboard/
        // controls and skew the family progress count.
        const normalizedControlId = controlIdToNist(link.controlId)

        // Resolve or lazy-create the org's control_record
        let [record] = await tx
          .select({ id: controlRecords.id })
          .from(controlRecords)
          .where(
            and(
              eq(controlRecords.organizationId, auth.organizationId),
              eq(controlRecords.controlId, normalizedControlId)
            )
          )
          .limit(1)
        if (!record) {
          ;[record] = await tx
            .insert(controlRecords)
            .values({
              organizationId: auth.organizationId,
              controlId: normalizedControlId,
            })
            .returning({ id: controlRecords.id })
        }

        // Per-objective fan-out: one completion row per (control, objective)
        // when the manifest carries the breakdown; otherwise a single row
        // with objective_id=null. The artifact label encodes the objective so
        // the existing (control_record_id, artifact_label) uniqueness still
        // dedupes idempotent re-archives. Manifest keys may arrive in either
        // CMMC or NIST form depending on TrainOS version — try both.
        const objectives =
          objectivesPerControl[normalizedControlId] ??
          objectivesPerControl[link.controlId] ??
          [null as string | null]
        for (const objective of objectives) {
          const labelSuffix = objective ? `:${objective}` : ""
          const artifactLabel = `ir_tabletop_bundle:${bundle.id}${labelSuffix}`
          const valueText = objective
            ? `IR tabletop AAR archived as bundle ${bundle.id} satisfies ${link.controlId}${objective} (manifest sha256 ${body.manifestSha256.slice(0, 16)}…). Exercise ${id}, version ${body.bundleVersion}.`
            : `IR tabletop AAR archived as bundle ${bundle.id} (manifest sha256 ${body.manifestSha256.slice(0, 16)}…). Exercise ${id}, version ${body.bundleVersion}.`
          const [completion] = await tx
            .insert(governanceArtifactCompletions)
            .values({
              organizationId: auth.organizationId,
              controlRecordId: record.id,
              artifactLabel,
              artifactType: "ATTESTATION",
              valueText,
              attestedBy: auth.userId ?? null,
              attestedAt: new Date(),
              objectiveId: objective ?? null,
            })
            .onConflictDoUpdate({
              target: [
                governanceArtifactCompletions.controlRecordId,
                governanceArtifactCompletions.artifactLabel,
              ],
              set: {
                valueText,
                attestedAt: new Date(),
                updatedAt: new Date(),
                objectiveId: objective ?? null,
              },
            })
            .returning({ id: governanceArtifactCompletions.id })
          completionInserts.push({
            // Normalized NIST form so downstream revalidatePath
            // (/dashboard/controls/{id}) hits the canonical route and the
            // audit-log detail field stays consistent with every other
            // controlId-keyed log.
            controlId: normalizedControlId,
            objectiveId: objective ?? null,
            completionId: completion.id,
          })
        }

        // Stamp lastValidationDate on the control record so the readiness
        // checklist's cadence math reflects the exercise.
        await tx
          .update(controlRecords)
          .set({
            lastValidationDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(controlRecords.id, record.id))
      }

      // ─── Per-named-participant dispute rows (migration 0065) ────────────
      // For every facilitator-attested participant, create an
      // ─── Upsert ir_exercise_participants from attestationBasis ─────────
      // TrainOS owns participant identity end-to-end and ships full context
      // (id + name + email + role) on every archive. Codex's
      // ir_participant_disputes.participant_id is a uuid FK to
      // ir_exercise_participants.id, so a TrainOS-supplied uuid that
      // doesn't already have a row in ir_exercise_participants would
      // crash the dispute insert with a fkey violation (the original
      // smoke 500). Mirror the auto-create-exercise pattern: upsert each
      // attested participant by id with ON CONFLICT DO NOTHING so the FK
      // target exists for the dispute insert below AND so re-archives
      // (idempotent at manifest hash) don't double-insert.
      const participantUpserts = (body.attestationBasis ?? [])
        .filter((p) => p.participantId && isUuid(p.participantId))
        .map((p) => ({
          id: p.participantId!,
          exerciseId: exercise.id,
          name: p.participantName,
          // ir_exercise_participants.organization is NOT NULL but absent
          // from the TrainOS payload — fall back to the exercise's
          // customerName which is already populated and audit-defensible.
          organization: exercise.customerName ?? "Unknown",
          role: mapParticipantRole(p.participantRole),
          email: p.participantEmail ?? null,
        }))
      if (participantUpserts.length > 0) {
        await tx
          .insert(irExerciseParticipants)
          .values(participantUpserts)
          .onConflictDoNothing({ target: irExerciseParticipants.id })
      }

      // ─── ir_participant_disputes (one per named attestee with email) ───
      // The dispute_token is opaque (32 bytes hex). Email send happens
      // out-of-band — this transaction only creates the rows so they
      // exist when the seal job runs in 7 days OR when a participant
      // clicks the magic link (whichever comes first).
      //
      // Non-uuid participantIds (cuids, synthetic ids) coerce to null —
      // the cuid is preserved verbatim in ir_exercise_bundles.attestation
      // _basis_json so a C3PAO can correlate the participant back to
      // TrainOS by email + cuid + name.
      const disputeRows = (body.attestationBasis ?? [])
        .filter((p) => p.participantEmail) // need an email to dispute to
        .map((p) => ({
          bundleId: bundle.id,
          participantId: isUuid(p.participantId) ? p.participantId : null,
          participantEmail: p.participantEmail!.toLowerCase(),
          participantName: p.participantName,
          disputeToken: randomBytes(32).toString("hex"),
          disputeTokenExpiresAt: new Date(attendanceSealAtIso),
        }))
      if (disputeRows.length > 0) {
        await tx.insert(irParticipantDisputes).values(disputeRows)
      }

      return { run, bundle, completionInserts, disputeRows }
    })

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "bundle_archived",
      resourceType: "ir_exercise_bundle",
      resourceId: result.bundle.id,
      details: {
        exerciseId: id,
        bundleVersion: body.bundleVersion,
        manifestSha256: body.manifestSha256,
        bundleSha256: body.bundleSha256,
        fileCount: body.files.length,
        snapshotVersion: stateSnapshot.snapshotVersion,
        snapshotParticipantCount: stateSnapshot.participants.length,
        snapshotFindingCount: stateSnapshot.findings.length,
        bytesArchived,
        storageDriver,
        completionsAttached: result.completionInserts.length,
        completionControls: result.completionInserts.map((c) => c.controlId),
        // ── Migration 0065: IR satisfaction hardening ──
        executedAt: executedAtIso,
        validThroughAt: validThroughIso,
        attendanceSealAt: attendanceSealAtIso,
        attestationBasisCount: body.attestationBasis?.length ?? 0,
        attendanceCorroborationKind: body.attendanceCorroborationKind ?? null,
        bundleState: "provisional",
        anchorHash,
        prevAnchorHash: prevAnchorHash || null,
        vaultStorageUri: body.vaultStorageUri ?? null,
        // Accept either bytesPersisted (original field name) or
// vaultBytesPersisted (TrainOS rename). vaultBytesPersisted wins
// when both are sent — it's closer to the post-upload truth.
bytesPersisted: body.vaultBytesPersisted ?? body.bytesPersisted ?? false,
        // Pilot escape hatch breadcrumb. true iff CODEX_ALLOW_COMMERCIAL_
        // AZURE_FOR_DEV was set AND the URL was commercial Azure. Lets a
        // C3PAO query for any bundle archived during the pilot window:
        //   SELECT * FROM audit_logs
        //   WHERE action = 'bundle_archived'
        //     AND details->>'pilotBypassActive' = 'true';
        pilotBypassActive,
        disputeRowsCreated: result.disputeRows.length,
      },
      req,
    })

    // ─── POA&M emission (Codex migration 0065 step 3) ────────────────────
    // After the archive transaction commits, walk the snapshot for
    // high/critical findings without closed corrective actions and the
    // bundle's irCoverage block for the DIBNet gap. Emit POA&Ms outside
    // the archive tx so a POA&M write failure can't roll back the
    // bundle. Best-effort — log and continue if it errors.
    let emittedPoams: { poamId: string; controlId: string; trigger: string }[] = []
    try {
      const findingsForEmission: FindingForEmission[] = stateSnapshot.findings.map(
        (f) => ({
          id: f.id,
          controlId: f.controlId,
          severity: String(f.severity),
          title: f.title,
          description: f.description,
          hasClosedCorrectiveAction: (f.correctiveActions ?? []).some(
            (ca) => ca.status === "completed" || ca.closedAt !== null,
          ),
        }),
      )
      const irCoverage = (body.manifest?.irCoverage ?? undefined) as
        | Record<string, { satisfied: boolean; gaps: string[] } | undefined>
        | undefined
      emittedPoams = await emitPoamFromBundle({
        organizationId: auth.organizationId,
        exerciseId: id,
        bundleId: result.bundle.id,
        findings: findingsForEmission,
        irCoverage,
      })
    } catch (emitErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[ir-bundle/poam-emission] failed for bundle=${result.bundle.id}:`,
        emitErr,
      )
    }

    // ─── Dispute notification emails (Codex migration 0065 step 3) ───────
    // Send a magic-link confirm/dispute email to every facilitator-attested
    // participant whose ir_participant_disputes row was created in the
    // archive transaction. Best-effort — Resend failures log but don't
    // affect the bundle's archived state. Rows without notification_sent_at
    // can be retried by a future seal job or operator action.
    let disputeEmailResult: { total: number; sent: number; skipped: number; failed: number } = {
      total: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    }
    try {
      disputeEmailResult = await sendIrParticipantDisputeNotifications(
        result.bundle.id,
      )
    } catch (emailErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[ir-bundle/dispute-email] failed for bundle=${result.bundle.id}:`,
        emailErr,
      )
    }

    // Phase B trigger: rescore every control the bundle archive linked
    // (3.6.1/3.6.2/3.6.3 + any adjacent controls in ir_exercise_controls).
    // The canonical helper picks up the new operational evidence and
    // flips the affected controls' aggregate_finding accordingly. Best-
    // effort; never throws.
    await scoreControlsAffectedBy({
      organizationId: auth.organizationId,
      triggerSource: "ir_bundle_archived",
      controlIds: result.completionInserts.map((c) => c.controlId),
      triggeredByUserId: auth.userId,
    })

    // Bundle archive may have flipped 3.6.1/3.6.2/3.6.3 (and any adjacent
    // controls linked via ir_exercise_controls) into the customer's
    // operational evidence. Invalidate cached server-renders so the
    // dashboard rollup, readiness checklist, and Outstanding Wizard all
    // reflect the new state on the customer's next navigation.
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/readiness")
    revalidatePath("/dashboard/readiness/outstanding")
    revalidatePath("/dashboard/incident-response/tabletop")
    revalidatePath("/dashboard/poam")
    for (const c of result.completionInserts) {
      revalidatePath(`/dashboard/controls/${c.controlId}`)
    }
    // Side-effects audit log — fires after POA&M emission + dispute emails
    // so their counts can be captured. Separate event from bundle_archived
    // so the canonical archive event lands in the audit feed first.
    if (emittedPoams.length > 0 || disputeEmailResult.total > 0) {
      await logIrAuditEvent({
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: "bundle_side_effects",
        resourceType: "ir_exercise_bundle",
        resourceId: result.bundle.id,
        details: {
          emittedPoams,
          disputeEmail: disputeEmailResult,
        },
        req,
      })
    }

    return NextResponse.json(
      { alreadyArchived: false, bundle: result.bundle },
      { status: 201 }
    )
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
