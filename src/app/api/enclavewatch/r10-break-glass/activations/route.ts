/**
 * POST /api/enclavewatch/r10-break-glass/activations
 *
 * Ingest endpoint for Entra PIM activations that elevate identities into
 * the R10 (MAC-Vault-IR) administrative group. Called on a cadence by
 * the EnclaveWatch collector running inside the customer's vault under
 * the R3 audit-collector domain (per MAC-SOP-235 §5.3, §5.5).
 *
 * Each accepted activation opens a `r10_break_glass_activations` row
 * with `status='pending_review'`. The row must be transitioned to
 * `reviewed` by a non-activator within 24h (MAC-SOP-235 §5.3) via
 * PATCH /api/sod/r10-break-glass/[id].
 *
 * Body shape:
 * {
 *   "activations": [
 *     {
 *       "external_activation_id": "<Entra PIM request id or synth id>",
 *       "activator_principal": "alice@mactech",
 *       "activated_role": "MAC-Vault-IR",
 *       "activation_started_at": "2026-05-16T01:14:32Z",
 *       "activation_ends_at": "2026-05-16T05:14:32Z",      // optional
 *       "activation_reason": "P1 — vault tamper investigation",  // optional
 *       "pim_approver_principal": "bob@mactech",            // optional
 *       "mfa_claim": "phr",                                  // optional
 *       "source_event": { ... }                              // optional pass-through
 *     }
 *   ]
 * }
 *
 * Idempotency: unique index on (org, external_activation_id). Re-posting
 * a payload that includes already-recorded activations is a no-op for
 * those rows; new ones still get inserted.
 *
 * Auth: bearer (organizations.enclavewatch_api_token) or session
 * (Admin/Compliance, for manual backfill / testing).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boundaries, r10BreakGlassActivations } from "@/db/schema";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { writeAuditLog } from "@/lib/audit";

interface ActivationInput {
  external_activation_id: string;
  activator_principal: string;
  activated_role: string;
  activation_started_at: string;
  activation_ends_at?: string | null;
  activation_reason?: string | null;
  pim_approver_principal?: string | null;
  mfa_claim?: string | null;
  source_event?: Record<string, unknown>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateActivation(raw: unknown): ActivationInput | string {
  if (typeof raw !== "object" || raw === null) return "activation entry must be an object";
  const r = raw as Record<string, unknown>;
  if (typeof r.external_activation_id !== "string" || r.external_activation_id.length === 0)
    return "external_activation_id (string) required";
  if (typeof r.activator_principal !== "string" || r.activator_principal.length === 0)
    return "activator_principal (string) required";
  if (typeof r.activated_role !== "string" || r.activated_role.length === 0)
    return "activated_role (string) required";
  if (typeof r.activation_started_at !== "string" || !parseDate(r.activation_started_at))
    return "activation_started_at (RFC3339 string) required";
  return {
    external_activation_id: r.external_activation_id,
    activator_principal: r.activator_principal,
    activated_role: r.activated_role,
    activation_started_at: r.activation_started_at,
    activation_ends_at: typeof r.activation_ends_at === "string" ? r.activation_ends_at : null,
    activation_reason: typeof r.activation_reason === "string" ? r.activation_reason : null,
    pim_approver_principal:
      typeof r.pim_approver_principal === "string" ? r.pim_approver_principal : null,
    mfa_claim: typeof r.mfa_claim === "string" ? r.mfa_claim : null,
    source_event:
      typeof r.source_event === "object" && r.source_event !== null
        ? (r.source_event as Record<string, unknown>)
        : {},
  };
}

export async function POST(req: Request) {
  const authResult = await resolveOrgFromSessionOrBearer(req);
  if (!authResult) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = authResult.orgId;

  const body = (await req.json().catch(() => ({}))) as { activations?: unknown };
  if (!Array.isArray(body.activations)) {
    return NextResponse.json(
      { error: "activations (array) required" },
      { status: 400 },
    );
  }
  if (body.activations.length === 0) {
    return NextResponse.json({ inserted: 0, duplicates: 0 });
  }

  const validated: ActivationInput[] = [];
  for (let i = 0; i < body.activations.length; i++) {
    const r = validateActivation(body.activations[i]);
    if (typeof r === "string") {
      return NextResponse.json(
        { error: `activations[${i}]: ${r}` },
        { status: 400 },
      );
    }
    validated.push(r);
  }

  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) {
    return NextResponse.json(
      { error: "no boundary provisioned for organization" },
      { status: 409 },
    );
  }

  let inserted = 0;
  let duplicates = 0;
  for (const a of validated) {
    try {
      const result = await db
        .insert(r10BreakGlassActivations)
        .values({
          organizationId: orgId,
          boundaryId: boundary.id,
          externalActivationId: a.external_activation_id,
          activatorPrincipal: a.activator_principal,
          activatedRole: a.activated_role,
          activationStartedAt: new Date(a.activation_started_at),
          activationEndsAt: a.activation_ends_at ? new Date(a.activation_ends_at) : null,
          activationReason: a.activation_reason ?? null,
          pimApproverPrincipal: a.pim_approver_principal ?? null,
          mfaClaim: a.mfa_claim ?? null,
          status: "pending_review",
          sourceEvent: a.source_event ?? {},
        })
        .onConflictDoNothing({
          target: [
            r10BreakGlassActivations.organizationId,
            r10BreakGlassActivations.externalActivationId,
          ],
        })
        .returning({ id: r10BreakGlassActivations.id });
      if (result.length > 0) inserted += 1;
      else duplicates += 1;
    } catch (err) {
      console.error(
        `[r10-break-glass] failed to ingest activation ${a.external_activation_id}:`,
        err,
      );
    }
  }

  try {
    await writeAuditLog({
      organizationId: orgId,
      action: "sod.r10_break_glass.ingested",
      resourceType: "r10_break_glass_activation",
      resourceId: null,
      details: {
        total_in_payload: validated.length,
        inserted,
        duplicates,
        triggered_via: authResult.via,
      },
    });
  } catch (err) {
    console.error("[r10-break-glass] audit log write failed:", err);
  }

  return NextResponse.json({
    total_in_payload: validated.length,
    inserted,
    duplicates,
  });
}
