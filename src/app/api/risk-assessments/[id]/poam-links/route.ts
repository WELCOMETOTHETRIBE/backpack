/**
 * POST /api/risk-assessments/[id]/poam-links
 *
 * Attaches a POA&M record to a specific risk inside an assessment.
 *
 * Two modes:
 *   1. poamEntryId — canonical, FK into poam_entries (control-plane POA&M).
 *   2. poamExternalRef — opaque string for orgs whose POA&Ms live in
 *      an external GRC tool. Captured for traceability; not validated.
 *
 * Exactly one must be supplied. Schema CHECK enforces this.
 *
 * Auth: Compliance + Admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  riskAssessments,
  riskPoamLinks,
  poamEntries,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import {
  authorizeRiskRequest,
  bridgeErrorResponse,
  logRaAuditEvent,
} from "@/lib/risk-assessment-bridge";
import { TERMINAL_STATUSES } from "@/lib/risk-assessment/lifecycle";

const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);

const LinkSchema = z
  .object({
    riskExternalId: z.string().min(1).max(64),
    poamEntryId: z.string().uuid().optional(),
    poamExternalRef: z.string().min(1).max(512).optional(),
    poamSource: z.enum(["control_plane", "vault", "external"]).default("control_plane"),
    sanitizedTitle: z.string().min(1).max(200).optional(),
    severity: SeverityEnum.optional(),
    ownerRole: z.string().min(1).max(64).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    vaultPointer: z.string().min(1).optional(),
    linkHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.poamEntryId ? 1 : 0) + (v.poamExternalRef ? 1 : 0) === 1,
    { message: "Supply exactly one of poamEntryId or poamExternalRef." },
  );

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rawBody = await req.text();
  let auth: Awaited<ReturnType<typeof authorizeRiskRequest>>;
  let parsed: ReturnType<typeof LinkSchema.safeParse>;
  try {
    auth = await authorizeRiskRequest(req, rawBody);
    const json = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    parsed = LinkSchema.safeParse(json);
    if (!parsed.success) return bridgeErrorResponse(parsed.error);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
  const orgId = auth.organizationId;

  // Parent assessment must exist, belong to org, not be finalized.
  const [assessment] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(eq(riskAssessments.id, id), eq(riskAssessments.organizationId, orgId)),
    )
    .limit(1);
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (TERMINAL_STATUSES.includes(assessment.status as "finalized" | "superseded")) {
    return NextResponse.json(
      { error: `Assessment is ${assessment.status}; cannot mutate.` },
      { status: 409 },
    );
  }

  // If a poamEntryId was supplied, it must belong to this org.
  if (parsed.data.poamEntryId) {
    const [poam] = await db
      .select({ id: poamEntries.id })
      .from(poamEntries)
      .where(
        and(
          eq(poamEntries.id, parsed.data.poamEntryId),
          eq(poamEntries.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!poam) {
      return NextResponse.json(
        { error: "POA&M entry not found for this org." },
        { status: 422 },
      );
    }
  }

  // Verify the risk exists in this assessment's register pivot.
  // postgres-js returns rows directly as an array — not wrapped in
  // { rows }. Same bug fixed in the /risks route during the smoke
  // test; mirroring the fix here so this route doesn't always 422
  // ("Risk not found") even when the risk is genuinely there.
  const riskExists = (await db.execute(sql`
    SELECT 1 FROM ${governanceRegisterEntries} gre
    JOIN ${governanceRegisters} gr ON gr.id = gre.register_id
    WHERE gr.organization_id = ${orgId}
      AND gr.register_key = 'risk_register'
      AND gre.entry_data ->> 'assessment_id' = ${assessment.assessmentPivotId}
      AND gre.entry_data ->> 'risk_id' = ${parsed.data.riskExternalId}
      AND gre.status = 'final'
    LIMIT 1
  `)) as unknown as Array<unknown>;
  if (riskExists.length === 0) {
    return NextResponse.json(
      {
        error:
          "Risk not found in the register for this assessment. Cannot link a POA&M to a risk that isn't recorded.",
        riskExternalId: parsed.data.riskExternalId,
      },
      { status: 422 },
    );
  }

  // Insert / upsert (one link per (assessment, risk_external_id)).
  const [created] = await db
    .insert(riskPoamLinks)
    .values({
      organizationId: orgId,
      riskAssessmentId: assessment.id,
      riskExternalId: parsed.data.riskExternalId,
      poamEntryId: parsed.data.poamEntryId ?? null,
      poamExternalRef: parsed.data.poamExternalRef ?? null,
      poamSource: parsed.data.poamSource,
      sanitizedTitle: parsed.data.sanitizedTitle ?? null,
      severity: parsed.data.severity ?? null,
      ownerRole: parsed.data.ownerRole ?? null,
      dueDate: parsed.data.dueDate ?? null,
      vaultPointer: parsed.data.vaultPointer ?? null,
      linkHash: parsed.data.linkHash ?? null,
    })
    .onConflictDoUpdate({
      target: [riskPoamLinks.riskAssessmentId, riskPoamLinks.riskExternalId],
      set: {
        poamEntryId: parsed.data.poamEntryId ?? null,
        poamExternalRef: parsed.data.poamExternalRef ?? null,
        poamSource: parsed.data.poamSource,
        sanitizedTitle: parsed.data.sanitizedTitle ?? null,
        severity: parsed.data.severity ?? null,
        ownerRole: parsed.data.ownerRole ?? null,
        dueDate: parsed.data.dueDate ?? null,
        vaultPointer: parsed.data.vaultPointer ?? null,
        linkHash: parsed.data.linkHash ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await logRaAuditEvent({
    organizationId: orgId,
    userId: auth.userId,
    action: "risk_assessment.poam_linked",
    resourceType: "risk_poam_link",
    resourceId: created.id,
    details: {
      riskAssessmentId: assessment.id,
      assessmentPivotId: assessment.assessmentPivotId,
      riskExternalId: created.riskExternalId,
      poamEntryId: created.poamEntryId,
      poamExternalRef: created.poamExternalRef,
      poamSource: created.poamSource,
      mode: auth.mode,
      serviceCaller: auth.serviceCaller ?? null,
      controlId: "3.11.1",
    },
    req,
  });

  revalidatePath(`/dashboard/controls/3.11.1`);

  return NextResponse.json({ ok: true, link: created });
}
