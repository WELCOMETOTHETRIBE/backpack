import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controlRecordHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_PRESETS } from "@/lib/compliance/scoping-presets";
import { computeAndPersistSprsScore } from "@/lib/sprs";

/**
 * POST /api/control-records/apply-scoping-preset
 *
 * Bulk-applies Not Applicable status + justification narrative to a set of
 * controls defined by a scoping preset.
 *
 * Body: { preset_id: string }
 *
 * Returns { applied: number, skipped: number, controls: string[] }
 *
 * Only controls currently in not_started or in_progress are updated.
 * Controls already assessed, inherited, or explicitly set to another terminal
 * state are left untouched.
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { preset_id } = body as { preset_id?: string };
    if (!preset_id) {
      return NextResponse.json({ error: "preset_id required" }, { status: 400 });
    }

    const preset = ALL_PRESETS.find((p) => p.id === preset_id);
    if (!preset) {
      return NextResponse.json(
        { error: `Unknown preset "${preset_id}"`, available: ALL_PRESETS.map((p) => p.id) },
        { status: 400 }
      );
    }

    // Protected statuses — never overwrite these
    const PROTECTED = ["assessed", "inherited", "implemented"];

    const appliedControls: string[] = [];
    const skippedControls: string[] = [];

    for (const sc of preset.controls) {
      const [record] = await db
        .select({ id: controlRecords.id, implementationStatus: controlRecords.implementationStatus })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            eq(controlRecords.controlId, sc.controlId)
          )
        )
        .limit(1);

      if (!record) {
        skippedControls.push(sc.controlId); // no record yet — will be auto-created on first ingest
        continue;
      }

      if (PROTECTED.includes(record.implementationStatus)) {
        skippedControls.push(sc.controlId);
        continue;
      }

      // Write audit trail entry
      if (user.id) {
        await db.insert(controlRecordHistory).values({
          controlRecordId: record.id,
          changedById: user.id,
          fieldName: "implementationStatus",
          oldValue: record.implementationStatus,
          newValue: "not_applicable",
        });
      }

      await db
        .update(controlRecords)
        .set({
          implementationStatus: "not_applicable",
          technicalStatus: "not_applicable",
          governanceNarrative: sc.reason,
          updatedAt: new Date(),
        })
        .where(eq(controlRecords.id, record.id));

      appliedControls.push(sc.controlId);
    }

    // Recalculate SPRS score since N/A changes affect it
    await computeAndPersistSprsScore(orgId).catch(() => null);

    console.log(
      JSON.stringify({
        event: "scoping_preset_applied",
        orgId,
        presetId: preset_id,
        applied: appliedControls.length,
        skipped: skippedControls.length,
      })
    );

    return NextResponse.json({
      preset_id,
      applied: appliedControls.length,
      skipped: skippedControls.length,
      applied_controls: appliedControls,
      skipped_controls: skippedControls,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * GET /api/control-records/apply-scoping-preset
 * Returns available presets (id, label, description, control count).
 */
export async function GET() {
  try {
    await requireOrg();
    return NextResponse.json(
      ALL_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        control_count: p.controls.length,
        controls: p.controls.map((c) => ({ controlId: c.controlId, domain: c.domain, title: c.title })),
      }))
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
