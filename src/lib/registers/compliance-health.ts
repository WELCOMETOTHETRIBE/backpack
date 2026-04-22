/**
 * Compliance Register Health — server-side utility
 *
 * Shared logic for computing register health status.
 * Used by both the API route and the dashboard server component.
 */

import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getRegisterSchemas } from "@/data/cmmc/register-schemas";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { REGISTER_DISPLAY_NAMES } from "./display-names";

export { REGISTER_DISPLAY_NAMES };

export type RegisterHealthStatus = "current" | "due_soon" | "overdue" | "never_used";

export type RegisterHealthSummary = {
  registerKey: string;
  displayName: string;
  status: RegisterHealthStatus;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  entryCount: number;
  href: string;
};

function computeHealthStatus(
  lastEntryAt: Date | null,
  cadenceDays: number | null
): { status: RegisterHealthStatus; daysOverdue: number | null; daysUntilDue: number | null } {
  if (cadenceDays === null || cadenceDays === 0) {
    if (!lastEntryAt) return { status: "never_used", daysOverdue: null, daysUntilDue: null };
    return { status: "current", daysOverdue: null, daysUntilDue: null };
  }
  if (!lastEntryAt) {
    return { status: "never_used", daysOverdue: null, daysUntilDue: null };
  }
  const cadenceMs = cadenceDays * 86_400_000;
  const nextDue = lastEntryAt.getTime() + cadenceMs;
  const msUntil = nextDue - Date.now();
  const daysUntil = Math.ceil(msUntil / 86_400_000);
  if (msUntil < 0) return { status: "overdue", daysOverdue: Math.abs(daysUntil), daysUntilDue: null };
  if (daysUntil <= 7) return { status: "due_soon", daysOverdue: null, daysUntilDue: daysUntil };
  return { status: "current", daysOverdue: null, daysUntilDue: daysUntil };
}

/**
 * Fetch register health for all C3PAO-required registers for an org.
 * Only returns registers that have at least one associated NIST control.
 */
export async function getComplianceRegisterHealth(orgId: string): Promise<RegisterHealthSummary[]> {
  const schemas = getRegisterSchemas().registerSchemas;

  // Build control associations from intelligence data
  const registerControlMap = new Map<string, string[]>();
  for (const intel of CONTROL_INTELLIGENCE) {
    if (intel.registerSchemaId && intel.registerRequired) {
      const arr = registerControlMap.get(intel.registerSchemaId) ?? [];
      if (!arr.includes(intel.controlId)) arr.push(intel.controlId);
      registerControlMap.set(intel.registerSchemaId, arr);
    }
  }

  const orgRegisters = await db
    .select()
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const orgRegisterMap = new Map(orgRegisters.map((r) => [r.registerKey, r]));

  const results: RegisterHealthSummary[] = [];

  for (const schema of schemas) {
    const controlIds = registerControlMap.get(schema.register_id);
    if (!controlIds?.length) continue;

    const orgReg = orgRegisterMap.get(schema.register_id);
    const cadenceDays = orgReg?.defaultCadenceDays ?? schema.default_cadence_days ?? null;
    const effectiveCadence = !cadenceDays || cadenceDays === 0 ? null : cadenceDays;

    let lastEntryAt: Date | null = null;
    let entryCount = 0;

    if (orgReg) {
      const [latest] = await db
        .select({ createdAt: governanceRegisterEntries.createdAt })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, orgReg.id))
        .orderBy(desc(governanceRegisterEntries.createdAt))
        .limit(1);
      if (latest) lastEntryAt = new Date(latest.createdAt);

      const allEntries = await db
        .select({ id: governanceRegisterEntries.id })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, orgReg.id));
      entryCount = allEntries.length;
    }

    const { status, daysOverdue, daysUntilDue } = computeHealthStatus(lastEntryAt, effectiveCadence);
    const displayName = REGISTER_DISPLAY_NAMES[schema.register_id] ?? schema.register_id;

    results.push({
      registerKey: schema.register_id,
      displayName,
      status,
      daysOverdue: daysOverdue ?? null,
      daysUntilDue: daysUntilDue ?? null,
      entryCount,
      href: `/dashboard/evidence-engine/registers/${schema.register_id}`,
    });
  }

  // Sort: overdue first, due_soon, never_used, current
  const ORDER: Record<RegisterHealthStatus, number> = { overdue: 0, due_soon: 1, never_used: 2, current: 3 };
  results.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.displayName.localeCompare(b.displayName));

  return results;
}

/**
 * Decide whether the register lane is satisfied for a given register.
 *
 * Event-driven registers (cadence_days = 0 — incident_log, termination,
 * maintenance_log, change_log, visitor_log, media_destruction,
 * personnel_screening, technical_compliance_run) legitimately have no entries
 * when the triggering event has not occurred (fresh vault: no incidents, no
 * terminations, no maintenance). Treating these as MISSING blocked the
 * register lane on the associated controls even when zero-entry is the
 * correct steady state. For event-driven registers we count the lane as
 * satisfied as soon as the register is provisioned for the org (i.e., the
 * org has acknowledged the register and is ready to log events).
 *
 * Scheduled registers (weekly / monthly / quarterly / annual cadence — e.g.
 * training_completion, audit_log_review, policy_review) still require a
 * final entry to satisfy the lane.
 */
export function isRegisterLaneSatisfied(args: {
  registerSchemaId: string;
  finalEntryCount: number;
  orgProvisioned: boolean;
}): boolean {
  if (args.finalEntryCount > 0) return true;
  const cadence = getCadenceRuleByRegisterId(args.registerSchemaId);
  const isEventDriven = cadence?.cadence_days === 0;
  return isEventDriven && args.orgProvisioned;
}

/** Aggregate counts by status */
export function aggregateRegisterHealth(registers: RegisterHealthSummary[]) {
  return {
    total: registers.length,
    current: registers.filter((r) => r.status === "current").length,
    dueSoon: registers.filter((r) => r.status === "due_soon").length,
    overdue: registers.filter((r) => r.status === "overdue").length,
    neverUsed: registers.filter((r) => r.status === "never_used").length,
  };
}
