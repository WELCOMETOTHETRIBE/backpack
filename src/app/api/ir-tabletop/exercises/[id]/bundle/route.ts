import { NextResponse, type NextRequest } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import {
  evidenceFiles,
  evidenceRuns,
  irAars,
  irCorrectiveActions,
  irExerciseBundles,
  irExerciseControls,
  irExerciseParticipants,
  irExercises,
  irFindings,
  irInjectResponses,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
  UploadBundleManifestSchema,
} from "@/lib/ir-tabletop-bridge"
import { getIrTabletopStorage } from "@/lib/ir-tabletop-storage"

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
      return NextResponse.json({ error: "Not found" }, { status: 404 })
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
      return NextResponse.json({ error: "Not found" }, { status: 404 })
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
        })
        .returning()

      return { run, bundle }
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
        fileCount: body.files.length,
        snapshotVersion: stateSnapshot.snapshotVersion,
        snapshotParticipantCount: stateSnapshot.participants.length,
        snapshotFindingCount: stateSnapshot.findings.length,
        bytesArchived,
        storageDriver,
      },
      req,
    })

    return NextResponse.json(
      { alreadyArchived: false, bundle: result.bundle },
      { status: 201 }
    )
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
