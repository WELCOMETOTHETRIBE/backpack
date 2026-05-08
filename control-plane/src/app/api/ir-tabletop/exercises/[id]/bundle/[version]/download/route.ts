import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { irExerciseBundles, irExercises } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
} from "@/lib/ir-tabletop-bridge"
import { getIrTabletopStorage } from "@/lib/ir-tabletop-storage"

/**
 * GET /api/ir-tabletop/exercises/:id/bundle/:version/download
 *
 * Re-serves an archived bundle's ZIP bytes from the configured storage driver
 * (Phase 8). Both assessor (read-only) and admin callers can hit this; the
 * download is logged in the audit trail.
 *
 * Returns 404 if no bundle exists for that version, or 410 Gone if the bundle
 * row exists but the bytes weren't archived (manifest-only entry, e.g. created
 * before Phase 8 byte archival shipped).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const { id, version } = await params
    const versionNum = Number.parseInt(version, 10)
    if (!Number.isFinite(versionNum) || versionNum < 1) {
      return NextResponse.json(
        { error: "Invalid bundle version" },
        { status: 400 }
      )
    }

    const auth = await authorizeIrRequest(req, "")

    const row = (
      await db
        .select({
          bundleId: irExerciseBundles.id,
          bundleVersion: irExerciseBundles.bundleVersion,
          manifestSha256: irExerciseBundles.manifestSha256,
          storagePrefix: irExerciseBundles.storagePrefix,
        })
        .from(irExerciseBundles)
        .innerJoin(
          irExercises,
          eq(irExercises.id, irExerciseBundles.exerciseId)
        )
        .where(
          and(
            eq(irExerciseBundles.exerciseId, id),
            eq(irExerciseBundles.bundleVersion, versionNum),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]

    if (!row) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 })
    }
    if (!row.storagePrefix) {
      return NextResponse.json(
        {
          error:
            "This bundle was archived as manifest-only (no bytes stored). Re-generate from the training app to produce a fresh ZIP.",
        },
        { status: 410 }
      )
    }

    const storage = getIrTabletopStorage()
    const bytes = await storage.getBundle(row.storagePrefix)
    if (!bytes) {
      return NextResponse.json(
        {
          error: `Bytes not found in storage at key ${row.storagePrefix}. Storage driver=${storage.driverName}.`,
        },
        { status: 410 }
      )
    }

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "bundle_downloaded",
      resourceType: "ir_exercise_bundle",
      resourceId: row.bundleId,
      details: {
        exerciseId: id,
        bundleVersion: versionNum,
        mode: auth.mode,
        sizeBytes: bytes.length,
      },
      req,
    })

    const filename = `IR-Tabletop-bundle-v${versionNum}.zip`
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-IR-Manifest-Sha256": row.manifestSha256,
        "X-IR-Bundle-Version": String(versionNum),
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
