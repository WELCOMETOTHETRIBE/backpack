/**
 * Auto-register seeder: creates finalized governance register entries from
 * Azure/Entra evidence runs for the 9 registers that can be partially
 * automated. Each register gets at most one entry per evidence run (idempotent
 * by evidence_run_id in entryData). Entries are finalized immediately so the
 * scoring engine counts them toward register satisfaction.
 *
 * Called after findings are written in the import-report route.
 */
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries, evidenceFindings } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

/**
 * Map from registerKey → the control IDs whose findings prove the register
 * is being maintained. At least one matching finding in the run triggers a
 * new register entry.
 */
const REGISTER_CONTROLS: Record<string, string[]> = {
  baseline_config: ["3.4.1", "3.4.2", "3.4.3", "3.4.4"],
  control_monitoring: [
    "3.1.3", "3.1.8", "3.1.9", "3.1.10", "3.1.11", "3.1.12", "3.1.13",
    "3.1.14", "3.1.17", "3.1.19", "3.1.22",
    "3.12.1", "3.12.3",
    "3.13.1", "3.13.2", "3.13.3", "3.13.5", "3.13.7", "3.13.8",
    "3.13.10", "3.13.11", "3.13.12", "3.13.13", "3.13.14", "3.13.15", "3.13.16",
    "3.14.1", "3.14.2", "3.14.3", "3.14.4", "3.14.5", "3.14.6", "3.14.7",
  ],
  audit_config: ["3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.6", "3.3.7", "3.3.8", "3.3.9"],
  authenticator_mgmt: [
    "3.5.2", "3.5.3", "3.5.4", "3.5.5", "3.5.6",
    "3.5.7", "3.5.8", "3.5.9", "3.5.10", "3.5.11",
  ],
  access_authorization: ["3.1.1", "3.1.2", "3.1.5", "3.1.6", "3.1.7", "3.1.15", "3.1.16", "3.1.20", "3.5.1"],
  change_log: ["3.1.15", "3.1.16", "3.1.20", "3.4.5", "3.4.6", "3.4.7", "3.4.8", "3.4.9", "3.7.3", "3.7.4"],
  vuln_remediation: ["3.11.2", "3.14.1", "3.14.2", "3.14.3", "3.14.4", "3.14.5", "3.14.6", "3.14.7"],
  incident_log: ["3.3.4", "3.3.5", "3.6.1", "3.6.2", "3.6.3", "3.14.7"],
  role_assignment_matrix: ["3.1.4", "3.1.5"],
};

/**
 * Seed governance register entries from an evidence run.
 * Safe to call multiple times for the same run (idempotent).
 *
 * @param evidenceRunId - UUID of the newly-created evidence_runs row
 * @param orgId         - organization UUID
 * @param boundaryId    - boundary UUID
 * @param collectedAt   - timestamp of the evidence collection (used as finalizedAt)
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

  // Load all registers for this org once
  const registers = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(
      // Registers belong to the org OR are global (organizationId IS NULL)
      sql`(${governanceRegisters.organizationId} = ${orgId} OR ${governanceRegisters.organizationId} IS NULL)`
    );

  const registerByKey = new Map(registers.map((r) => [r.registerKey, r.id]));

  // Load all control IDs touched by this run (flat set, any status)
  const allControls = Object.values(REGISTER_CONTROLS).flat();
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
    const registerId = registerByKey.get(registerKey);
    if (!registerId) {
      // Register not seeded for this org yet — skip silently
      skipped.push(registerKey);
      continue;
    }

    // Does this run have any findings for this register's controls?
    const hasHit = controlIds.some((cid) => foundControlIds.has(cid));
    if (!hasHit) {
      skipped.push(registerKey);
      continue;
    }

    // Idempotency: already created an entry for this run?
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

    const hitControls = controlIds.filter((cid) => foundControlIds.has(cid));

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
