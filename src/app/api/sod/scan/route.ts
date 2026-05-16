/**
 * POST /api/sod/scan
 *
 * Detective-control ingestion endpoint for AC.L2-3.1.4. Accepts the
 * output of the enclave-side AD/Entra group-membership exporter, runs
 * the pure detective scan against the SoD matrix (MAC-SOP-235), and
 * persists findings to the sod_findings table.
 *
 * Body shape:
 * {
 *   "scan_run_id": "uuid (caller-provided; reuse across retries for idempotency)",
 *   "principals": [
 *     { "principal": "alice@mactech", "adGroups": ["MAC-Vault-SysAdmins", "MAC-Vault-CCB"] }
 *   ]
 * }
 *
 * Idempotency:
 *   - Open findings are guarded by a partial unique index on
 *     (org, principal, pair_role_a, pair_role_b) WHERE status='open'.
 *     Re-running the same scan does not create duplicate open rows.
 *   - Closed findings are NOT re-opened by a re-scan automatically;
 *     callers see "conflict still present" by querying open findings.
 *
 * Auth: Admin or Compliance role required. Phase 2A is operator-driven.
 * A future Phase 2B enhancement will accept signed payloads from a
 * service principal in the enclave.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sodFindings, boundaries } from "@/db/schema";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { writeAuditLog } from "@/lib/audit";
import { detectiveScan, scanMatrixVersion, type PrincipalGroupExport } from "@/lib/sod/detective-scan";
import { getAttestedPrincipals } from "@/lib/sod/attestations";

interface ScanRequestBody {
  scan_run_id?: unknown;
  principals?: unknown;
}

export async function POST(req: Request) {
  // Accept either an Admin/Compliance session (operator-triggered scan from
  // the dashboard) OR a bearer token issued to EnclaveWatch (the local
  // service running inside the customer's vault — Phase 2B scheduled
  // exporter). The bearer auth resolves the org server-side from
  // organizations.enclavewatch_api_token; no role check applies on the
  // bearer path since it represents an unattended service principal in
  // R3's domain, not a human role.
  const authResult = await resolveOrgFromSessionOrBearer(req);
  if (!authResult) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = authResult.orgId;

  const body = (await req.json().catch(() => ({}))) as ScanRequestBody;

  const scanRunId = typeof body.scan_run_id === "string" ? body.scan_run_id : null;
  if (!scanRunId) {
    return NextResponse.json(
      { error: "scan_run_id (uuid) required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.principals)) {
    return NextResponse.json(
      { error: "principals (array) required" },
      { status: 400 },
    );
  }

  const principals: PrincipalGroupExport[] = [];
  for (const p of body.principals) {
    if (
      typeof p !== "object" ||
      p === null ||
      typeof (p as { principal?: unknown }).principal !== "string" ||
      !Array.isArray((p as { adGroups?: unknown }).adGroups)
    ) {
      return NextResponse.json(
        { error: "each principal needs { principal: string, adGroups: string[] }" },
        { status: 400 },
      );
    }
    const principal = (p as { principal: string }).principal;
    const adGroups = ((p as { adGroups: unknown[] }).adGroups).filter(
      (g): g is string => typeof g === "string",
    );
    principals.push({ principal, adGroups });
  }

  // Resolve the org's single boundary (1 boundary per org in Trust Codex).
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

  // Pure scan, with currently-attested principals passed in so C-cells
  // covered by a fresh quarterly attestation aren't re-flagged on every
  // run. P-cells are always flagged regardless of attestation.
  const attestedPrincipals = await getAttestedPrincipals(orgId);
  const result = detectiveScan({ principals, attestedPrincipals });

  // Persist. For each finding, insert if no open row already exists for
  // (org, principal, pair) — relies on the partial unique index. ON CONFLICT
  // DO NOTHING is the cleanest way; Drizzle exposes that via onConflictDoNothing.
  let created = 0;
  let alreadyOpen = 0;
  for (const f of result.findings) {
    try {
      const inserted = await db
        .insert(sodFindings)
        .values({
          organizationId: orgId,
          boundaryId: boundary.id,
          subjectPrincipal: f.principal,
          roleIds: f.roleIds,
          pairRoleA: f.pair[0],
          pairRoleB: f.pair[1],
          dispositionType: f.dispositionType,
          severity: f.severity,
          status: "open",
          sourceScanRunId: scanRunId,
        })
        .onConflictDoNothing({
          target: [
            sodFindings.organizationId,
            sodFindings.subjectPrincipal,
            sodFindings.pairRoleA,
            sodFindings.pairRoleB,
          ],
        })
        .returning({ id: sodFindings.id });
      if (inserted.length > 0) created += 1;
      else alreadyOpen += 1;
    } catch (err) {
      console.error(
        `[sod-scan] failed to persist finding for ${f.principal} (${f.pair.join("×")}):`,
        err,
      );
    }
  }

  try {
    await writeAuditLog({
      organizationId: orgId,
      action: "sod.detective_scan.completed",
      resourceType: "sod_scan_run",
      resourceId: scanRunId,
      details: {
        matrix: scanMatrixVersion(),
        principals_scanned: result.principalsScanned,
        groups_observed: result.groupsObserved,
        findings_total: result.findings.length,
        findings_created: created,
        findings_already_open: alreadyOpen,
        triggered_via: authResult.via,
      },
    });
  } catch (err) {
    console.error("[sod-scan] audit log write failed:", err);
  }

  return NextResponse.json({
    scan_run_id: scanRunId,
    matrix: scanMatrixVersion(),
    principals_scanned: result.principalsScanned,
    groups_observed: result.groupsObserved,
    findings_total: result.findings.length,
    findings_created: created,
    findings_already_open: alreadyOpen,
  });
}
