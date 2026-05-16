/**
 * POST /api/sod/provisioning-check
 *
 * Preventive SoD check — Phase 3C of AC.L2-3.1.4. Called by the
 * EnclaveWatch admin wrapper (`Invoke-MacVaultGroupMembership.ps1`) before
 * any `Add-ADGroupMember` against a `MAC-Vault-*` group commits. Returns
 * one of:
 *   - allow                     — no conflict, proceed.
 *   - allow_with_attestation    — C-cell, ok if a quarterly attestation
 *                                 covers this identity. Wrapper instructs
 *                                 the operator to open one before retrying.
 *   - deny                      — Prohibited pair; wrapper aborts.
 *
 * Every call writes one row to `sod_provisioning_decisions`. The decision
 * row IS the operational evidence for 3.1.4[b].
 *
 * Auth: bearer (organizations.enclavewatch_api_token, for the wrapper)
 * OR session (Admin/Compliance, for ad-hoc / manual check).
 *
 * Body shape:
 * {
 *   "principal": "alice@mactech",
 *   "target_group": "MAC-Vault-SecAdmins",
 *   "existing_groups": ["MAC-Vault-SysAdmins"],
 *   "requested_by_principal": "ops@mactech",   // optional
 *   "request_id": "<uuid>"                      // optional correlation id
 * }
 *
 * Fail-open contract: if this endpoint throws or is unreachable, the
 * wrapper is documented to log the failure locally and proceed with the
 * AD operation. The detective scan (Phase 2) backstops the resulting
 * drift within 4 hours for P-cells per `sod_matrix.v1.json:fail_open_sla`.
 * Callers that explicitly want to record a fail_open event can POST a
 * decision row with `decision: "fail_open"` (via the same body shape +
 * a `force_fail_open: true` flag — Phase 3C+).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boundaries, sodProvisioningDecisions } from "@/db/schema";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { writeAuditLog } from "@/lib/audit";
import { decidePreventive } from "@/lib/sod/preventive-check";
import { getAttestedPrincipals } from "@/lib/sod/attestations";

interface CheckRequestBody {
  principal?: unknown;
  target_group?: unknown;
  existing_groups?: unknown;
  requested_by_principal?: unknown;
  request_id?: unknown;
}

export async function POST(req: Request) {
  const authResult = await resolveOrgFromSessionOrBearer(req);
  if (!authResult) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = authResult.orgId;

  const body = (await req.json().catch(() => ({}))) as CheckRequestBody;
  const principal = typeof body.principal === "string" ? body.principal.trim() : "";
  const targetGroup = typeof body.target_group === "string" ? body.target_group.trim() : "";
  if (!principal) return NextResponse.json({ error: "principal (string) required" }, { status: 400 });
  if (!targetGroup) return NextResponse.json({ error: "target_group (string) required" }, { status: 400 });

  const existingGroups = Array.isArray(body.existing_groups)
    ? body.existing_groups.filter((g): g is string => typeof g === "string")
    : [];
  const requestedByPrincipal =
    typeof body.requested_by_principal === "string" ? body.requested_by_principal : null;
  const requestId = typeof body.request_id === "string" ? body.request_id : null;

  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) {
    return NextResponse.json({ error: "no boundary provisioned for organization" }, { status: 409 });
  }

  // Run the pure decision over the matrix + attestation set.
  const attestedPrincipals = await getAttestedPrincipals(orgId);
  const result = decidePreventive({
    principal,
    targetGroup,
    existingGroups,
    attestedPrincipals,
  });

  // Persist the decision. No idempotency — every call is its own event.
  try {
    await db.insert(sodProvisioningDecisions).values({
      organizationId: orgId,
      boundaryId: boundary.id,
      subjectPrincipal: principal,
      targetGroup,
      existingGroups,
      resultingRoleIds: result.resultingRoleIds,
      decision: result.decision,
      conflictPairA: result.conflictPair?.[0] ?? null,
      conflictPairB: result.conflictPair?.[1] ?? null,
      reason: result.reason,
      requestedByPrincipal,
      triggeredVia: authResult.via,
      requestId,
    });
  } catch (err) {
    // Persistence failure shouldn't change the decision — return it
    // anyway so the wrapper can act. Log loudly for operator follow-up.
    console.error("[sod-preventive-check] persistence failed:", err);
  }

  try {
    await writeAuditLog({
      organizationId: orgId,
      action: "sod.preventive_check.decided",
      resourceType: "sod_provisioning_decision",
      resourceId: null,
      details: {
        principal,
        target_group: targetGroup,
        decision: result.decision,
        conflict_pair: result.conflictPair ?? null,
        triggered_via: authResult.via,
        requested_by_principal: requestedByPrincipal,
      },
    });
  } catch (err) {
    console.error("[sod-preventive-check] audit log write failed:", err);
  }

  return NextResponse.json({
    decision: result.decision,
    resulting_role_ids: result.resultingRoleIds,
    conflict_pair: result.conflictPair ?? null,
    reason: result.reason,
  });
}
