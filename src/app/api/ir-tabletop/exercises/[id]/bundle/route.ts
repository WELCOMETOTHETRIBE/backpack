import { NextResponse, type NextRequest } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import {
  evidenceFiles,
  evidenceRuns,
  irExerciseBundles,
  irExercises,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
  UploadBundleManifestSchema,
} from "@/lib/ir-tabletop-bridge"

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
          collectorVersion: "phase6.v1",
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
          storagePrefix: body.storagePrefix ?? null,
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
