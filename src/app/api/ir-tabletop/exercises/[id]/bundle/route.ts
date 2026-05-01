import { NextResponse, type NextRequest } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
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

      const completionInserts: { controlId: string; completionId: string }[] = []
      for (const link of linkedControls) {
        // Resolve or lazy-create the org's control_record
        let [record] = await tx
          .select({ id: controlRecords.id })
          .from(controlRecords)
          .where(
            and(
              eq(controlRecords.organizationId, auth.organizationId),
              eq(controlRecords.controlId, link.controlId)
            )
          )
          .limit(1)
        if (!record) {
          ;[record] = await tx
            .insert(controlRecords)
            .values({
              organizationId: auth.organizationId,
              controlId: link.controlId,
            })
            .returning({ id: controlRecords.id })
        }

        // Upsert a completion row keyed on (controlRecordId, artifactLabel).
        // The label embeds the bundle id so the same exercise's later bundles
        // (versions) each get their own completion row, and re-archiving the
        // same bundle (same id) is idempotent.
        const artifactLabel = `ir_tabletop_bundle:${bundle.id}`
        const [completion] = await tx
          .insert(governanceArtifactCompletions)
          .values({
            organizationId: auth.organizationId,
            controlRecordId: record.id,
            artifactLabel,
            artifactType: "ATTESTATION",
            valueText: `IR tabletop AAR archived as bundle ${bundle.id} (manifest sha256 ${body.manifestSha256.slice(0, 16)}…). Exercise ${id}, version ${body.bundleVersion}.`,
            attestedBy: auth.userId ?? null,
            attestedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              governanceArtifactCompletions.controlRecordId,
              governanceArtifactCompletions.artifactLabel,
            ],
            set: {
              valueText: `IR tabletop AAR archived as bundle ${bundle.id} (manifest sha256 ${body.manifestSha256.slice(0, 16)}…). Exercise ${id}, version ${body.bundleVersion}.`,
              attestedAt: new Date(),
              updatedAt: new Date(),
            },
          })
          .returning({ id: governanceArtifactCompletions.id })

        // Stamp lastValidationDate on the control record so the readiness
        // checklist's cadence math reflects the exercise.
        await tx
          .update(controlRecords)
          .set({
            lastValidationDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(controlRecords.id, record.id))

        completionInserts.push({
          controlId: link.controlId,
          completionId: completion.id,
        })
      }

      return { run, bundle, completionInserts }
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
        completionsAttached: result.completionInserts.length,
        completionControls: result.completionInserts.map((c) => c.controlId),
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
