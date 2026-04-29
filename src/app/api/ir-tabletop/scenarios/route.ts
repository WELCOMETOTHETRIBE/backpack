import { NextResponse, type NextRequest } from "next/server"
import { and, count, desc, eq, isNull, or } from "drizzle-orm"

import { db } from "@/db"
import { controls, irScenarios, organizations } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  CreateScenarioRequestSchema,
  logIrAuditEvent,
} from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/scenarios
 *
 * Returns active scenarios visible to the calling org:
 *   - Global library entries (organization_id IS NULL)
 *   - Custom entries scoped to this org (organization_id = callerOrgId)
 *
 * Phase 12: org-scoped custom scenarios. The seeded library remains global.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeIrRequest(req, "")

    const rows = await db
      .select()
      .from(irScenarios)
      .where(
        and(
          eq(irScenarios.isActive, true),
          or(
            isNull(irScenarios.organizationId),
            eq(irScenarios.organizationId, auth.organizationId)
          )
        )
      )
      .orderBy(desc(irScenarios.createdAt))

    return NextResponse.json(rows)
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

/**
 * POST /api/ir-tabletop/scenarios
 *
 * Save a custom scenario authored by the calling admin (typically after the
 * AI generator drafted it via /scenarios/generate and the admin reviewed +
 * approved). Auto-generates a unique code per-org: SCEN-<ORG-SLUG>-<NNN>.
 *
 * Validates every control id in the scenario against the live controls table
 * — defense in depth on top of the same check inside the generator endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = CreateScenarioRequestSchema.parse(JSON.parse(rawBody))

    // Validate control IDs against live controls table.
    const controlRows = await db
      .select({ controlId: controls.controlId })
      .from(controls)
    const validControlIds = new Set(controlRows.map((r) => r.controlId))
    const invalid: string[] = []
    for (const id of body.targetedControlIds) {
      if (!validControlIds.has(id)) invalid.push(id)
    }
    for (const inj of body.injectsJson) {
      for (const id of inj.controlIds) {
        if (!validControlIds.has(id) && !invalid.includes(id)) invalid.push(id)
      }
    }
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Scenario references ${invalid.length} unknown control id(s): ${invalid.slice(0, 5).join(", ")}. Pick from the seeded controls library.`,
          invalidControlIds: invalid,
        },
        { status: 422 }
      )
    }

    // Generate a unique code per-org: SCEN-<ORG-SLUG>-<NNN>
    const org = (
      await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, auth.organizationId))
        .limit(1)
    )[0]
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 })
    }
    const orgSlugClean = org.slug
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
    const customCount = (
      await db
        .select({ n: count() })
        .from(irScenarios)
        .where(
          and(
            eq(irScenarios.organizationId, auth.organizationId),
            eq(irScenarios.isCustom, true)
          )
        )
    )[0]
    const nextN = (customCount?.n ?? 0) + 1
    const code = `SCEN-${orgSlugClean}-${String(nextN).padStart(3, "0")}`

    const [inserted] = await db
      .insert(irScenarios)
      .values({
        code,
        version: 1,
        title: body.title,
        summary: body.summary,
        narrative: body.narrative,
        targetedControlIds: body.targetedControlIds,
        defaultRoe: body.defaultRoe,
        injectsJson: body.injectsJson,
        isActive: true,
        isCustom: true,
        createdByUserId: auth.userId,
        organizationId: auth.organizationId,
      })
      .returning()

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "scenario_created",
      resourceType: "ir_scenario",
      resourceId: inserted.id,
      details: {
        code: inserted.code,
        title: inserted.title,
        injectCount: body.injectsJson.length,
        controlCount: body.targetedControlIds.length,
        isCustom: true,
      },
      req,
    })

    return NextResponse.json(inserted, { status: 201 })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
