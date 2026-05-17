/**
 * Auto-register seeder: creates finalized governance register entries from
 * evidence runs. Each register gets at most one entry per evidence run
 * (idempotent by evidence_run_id in entryData). Entries are finalized
 * immediately so the scoring engine counts them toward register satisfaction.
 */
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries, evidenceFindings } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * Map from schema registerKey → the control IDs whose findings prove the
 * register is being maintained. At least one matching finding in the run
 * triggers a new register entry.
 *
 * Keys are schema IDs (singular form); resolveRegisterId() handles the alias
 * lookup to the org's seed-data key (e.g. audit_log_review → audit_log_review_records).
 */
const REGISTER_CONTROLS: Record<string, string[]> = {
  // ── Access Control ─────────────────────────────────────────────────────────
  access_authorization: [
    "3.1.1", "3.1.2", "3.1.5", "3.1.6", "3.1.7",
    "3.1.15", "3.1.16", "3.1.20", "3.5.1",
  ],
  remote_access_authorization: [
    "3.1.12", "3.1.13", "3.1.14", "3.1.15",
  ],
  external_system_connections: ["3.1.20"],
  role_assignment_matrix: ["3.1.4", "3.1.5"],

  // ── Identity & Authenticators ───────────────────────────────────────────────
  authenticator_mgmt: [
    "3.5.2", "3.5.3", "3.5.4", "3.5.5", "3.5.6",
    "3.5.7", "3.5.8", "3.5.9", "3.5.10", "3.5.11",
  ],
  service_account_inventory: ["3.5.5"],
  identity_inventory: ["3.5.1", "3.1.5", "3.1.6"],

  // ── Audit & Monitoring ──────────────────────────────────────────────────────
  audit_config: [
    "3.3.1", "3.3.2", "3.3.3", "3.3.4",
    "3.3.6", "3.3.7", "3.3.8", "3.3.9",
  ],
  // audit_log_review gets a weekly WSH hit via 3.3.4 (audit event generation)
  // and an Azure hit via 3.3.2 (audit record review). Either alone is sufficient.
  audit_log_review: ["3.3.2", "3.3.4", "3.1.7", "3.14.3", "3.14.7"],
  control_monitoring: [
    "3.1.3", "3.1.8", "3.1.9", "3.1.10", "3.1.11", "3.1.12", "3.1.13",
    "3.1.14", "3.1.17", "3.1.19", "3.1.22",
    "3.12.1", "3.12.3",
    "3.13.1", "3.13.2", "3.13.3", "3.13.5", "3.13.7", "3.13.8",
    "3.13.10", "3.13.11", "3.13.12", "3.13.13", "3.13.14", "3.13.15", "3.13.16",
    "3.14.1", "3.14.2", "3.14.3", "3.14.4", "3.14.5", "3.14.6", "3.14.7",
  ],

  // ── Configuration Management ────────────────────────────────────────────────
  baseline_config: ["3.4.1", "3.4.2", "3.4.3", "3.4.4"],
  change_log: [
    "3.1.15", "3.1.16", "3.1.20",
    "3.4.5", "3.4.6", "3.4.7", "3.4.8", "3.4.9",
    "3.7.3", "3.7.4",
  ],

  // ── Incident & IR ───────────────────────────────────────────────────────────
  incident_log: ["3.3.4", "3.3.5", "3.6.1", "3.6.2", "3.6.3", "3.14.7"],

  // ── Media ───────────────────────────────────────────────────────────────────
  // media_access: monthly attestation that media policies are verified in place.
  media_access: ["3.8.1", "3.8.6", "3.8.7"],

  // ── Risk & Vuln ─────────────────────────────────────────────────────────────
  vuln_remediation: [
    "3.11.2", "3.14.1", "3.14.2", "3.14.3",
    "3.14.4", "3.14.5", "3.14.6", "3.14.7",
  ],
};

// ── Shared register loader ──────────────────────────────────────────────────

type RegisterRow = { id: string; registerKey: string; isOrg: boolean };

async function loadOrgRegisters(orgId: string): Promise<Map<string, RegisterRow>> {
  const rows = await db
    .select({
      id: governanceRegisters.id,
      registerKey: governanceRegisters.registerKey,
      organizationId: governanceRegisters.organizationId,
    })
    .from(governanceRegisters)
    .where(
      sql`(${governanceRegisters.organizationId} = ${orgId} OR ${governanceRegisters.organizationId} IS NULL)`
    );

  // Org-specific rows take precedence over templates for the same key.
  const byKey = new Map<string, RegisterRow>();
  for (const r of rows) {
    const isOrg = r.organizationId !== null;
    const existing = byKey.get(r.registerKey);
    if (!existing || (!existing.isOrg && isOrg)) {
      byKey.set(r.registerKey, { id: r.id, registerKey: r.registerKey, isOrg });
    }
  }
  return byKey;
}

/**
 * Resolve the best register ID for a schema key, trying all alias candidates
 * (e.g. "audit_log_review" → also try "audit_log_review_records").
 * Prefers org-specific registers over templates when candidates differ.
 */
function resolveRegisterId(
  schemaKey: string,
  byKey: Map<string, RegisterRow>
): string | undefined {
  const candidates = resolveRegisterKeyCandidates(schemaKey);
  let best: RegisterRow | undefined;
  for (const k of candidates) {
    const hit = byKey.get(k);
    if (!hit) continue;
    if (!best || (!best.isOrg && hit.isOrg)) best = hit;
    if (best.isOrg) break;
  }
  return best?.id;
}

// ── Main seeder ─────────────────────────────────────────────────────────────

/**
 * Seed governance register entries from an evidence run.
 * Safe to call multiple times for the same run (idempotent).
 */
export async function seedRegistersFromEvidenceRun(
  evidenceRunId: string,
  orgId: string,
  boundaryId: string,
  collectedAt: Date,
  sourceLabel = "evidence run"
): Promise<{ seeded: string[]; skipped: string[] }> {
  const seeded: string[] = [];
  const skipped: string[] = [];

  const byKey = await loadOrgRegisters(orgId);

  // Load all control IDs touched by this run in one query.
  const allControls = [...new Set(Object.values(REGISTER_CONTROLS).flat())];
  const findings = await db
    .select({ controlId: evidenceFindings.controlId })
    .from(evidenceFindings)
    .where(
      and(
        eq(evidenceFindings.evidenceRunId, evidenceRunId),
        inArray(evidenceFindings.controlId, allControls)
      )
    );

  const foundControlIds = new Set(findings.map((f) => f.controlId));

  for (const [registerKey, controlIds] of Object.entries(REGISTER_CONTROLS)) {
    const registerId = resolveRegisterId(registerKey, byKey);
    if (!registerId) {
      skipped.push(registerKey);
      continue;
    }

    const hitControls = controlIds.filter((cid) => foundControlIds.has(cid));
    if (hitControls.length === 0) {
      skipped.push(registerKey);
      continue;
    }

    // Idempotency: one entry per (register, run).
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, registerId),
          eq(governanceRegisterEntries.boundaryId, boundaryId),
          sql`${governanceRegisterEntries.entryData}->>'evidence_run_id' = ${evidenceRunId}`
        )
      )
      .limit(1);

    if (existing) {
      skipped.push(registerKey);
      continue;
    }

    await db.insert(governanceRegisterEntries).values({
      registerId,
      boundaryId,
      entryType: "auto_recorded",
      status: "final",
      finalizedAt: collectedAt,
      exportable: true,
      entryData: {
        lifecycle_state: "auto_recorded",
        source: "evidence_run",
        evidence_run_id: evidenceRunId,
        controls_checked: hitControls,
        note: `Auto-recorded from ${sourceLabel}. ${hitControls.length} control check(s) found for this register.`,
      },
    });

    seeded.push(registerKey);
  }

  return { seeded, skipped };
}

// ── Technical compliance run seeder ────────────────────────────────────────

/**
 * Create one technical_compliance_run entry per OS/WSH evidence run.
 * Unlike seedRegistersFromEvidenceRun, this is not triggered by control
 * findings — every completed collector run gets exactly one entry.
 * Idempotent: no-op if the run already has an entry.
 */
export async function seedTechnicalComplianceRun(
  evidenceRunId: string,
  orgId: string,
  boundaryId: string,
  collectedAt: Date,
  runMeta: {
    runId: string;
    collectorName: string;
    collectorVersion: string;
    checksTotal: number;
    checksPassed: number;
    checksFailed: number;
  }
): Promise<boolean> {
  const byKey = await loadOrgRegisters(orgId);
  const registerId = resolveRegisterId("technical_compliance_run", byKey);
  if (!registerId) return false;

  const [existing] = await db
    .select({ id: governanceRegisterEntries.id })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, registerId),
        sql`${governanceRegisterEntries.entryData}->>'evidence_run_id' = ${evidenceRunId}`
      )
    )
    .limit(1);

  if (existing) return false;

  const passRate =
    runMeta.checksTotal > 0
      ? Math.round((runMeta.checksPassed / runMeta.checksTotal) * 100)
      : 0;

  await db.insert(governanceRegisterEntries).values({
    registerId,
    boundaryId,
    entryType: "auto_recorded",
    status: "final",
    finalizedAt: collectedAt,
    exportable: true,
    entryData: {
      lifecycle_state: "auto_recorded",
      source: "evidence_run",
      evidence_run_id: evidenceRunId,
      run_id: runMeta.runId,
      collector_name: runMeta.collectorName,
      collector_version: runMeta.collectorVersion,
      checks_total: runMeta.checksTotal,
      checks_passed: runMeta.checksPassed,
      checks_failed: runMeta.checksFailed,
      pass_rate_pct: passRate,
      note: `${runMeta.collectorName} v${runMeta.collectorVersion}: ${runMeta.checksPassed}/${runMeta.checksTotal} checks passed (${passRate}%).`,
    },
  });

  return true;
}
