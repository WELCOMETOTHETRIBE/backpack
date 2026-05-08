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
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
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

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Friday-end-of-week deadline: 17:00 UTC. */
const FRIDAY_UTC_HOUR = 17;
/** ISO-style day-of-week constants (matches Date.getUTCDay): Sun=0 ... Fri=5 ... Sat=6 */
const FRIDAY = 5;

/**
 * Returns the next Friday 17:00 UTC strictly at-or-after the given timestamp.
 * Used as the cycle-end anchor for weekly-cadence registers.
 */
function nextFridayAtOrAfter(d: Date): Date {
  const dow = d.getUTCDay();
  // Days forward to the upcoming Friday in the same week.
  // Sun(0)..Fri(5): FRIDAY - dow. Sat(6): wraps to next Friday → 6.
  const daysToFriday = dow <= FRIDAY ? FRIDAY - dow : 7 - dow + FRIDAY;
  let candidate = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + daysToFriday,
      FRIDAY_UTC_HOUR,
      0,
      0,
      0
    )
  );
  // If today IS Friday but past 17:00 UTC, advance to the next Friday.
  if (candidate.getTime() < d.getTime()) {
    candidate = new Date(candidate.getTime() + WEEK_MS);
  }
  return candidate;
}

/**
 * Compute the next deadline for a weekly-cadence register, anchored to
 * Friday 17:00 UTC end-of-week (per the ISSO weekly audit cadence model).
 *
 *   - Each cycle ends Friday at 17:00 UTC.
 *   - An entry made anytime within cycle W satisfies cycle W; next deadline
 *     becomes the END of cycle W+1 (the Friday 17:00 UTC AFTER the cycle the
 *     entry falls into).
 *   - An entry made AFTER a cycle's deadline (Friday > 17:00 UTC, weekend, or
 *     any time before the next Friday 17:00 UTC) counts toward the NEXT cycle.
 *
 * Examples:
 *   Tue 12:00 UTC  → entry in cycle ending this Fri 17:00 UTC
 *                    → next deadline = Fri 17:00 UTC NEXT week (10 days)
 *   Fri 16:00 UTC  → entry in cycle ending today at 17:00 UTC
 *                    → next deadline = Fri 17:00 UTC NEXT week (~7 days)
 *   Fri 18:00 UTC  → past today's deadline; cycle ending NEXT Fri owns it
 *                    → next deadline = Fri 17:00 UTC TWO weeks out (~13 days)
 *   Sat 02:00 UTC  → cycle ending NEXT Fri owns this entry
 *                    → next deadline = Fri 17:00 UTC TWO weeks out (~13 days)
 */
export function nextWeeklyDeadline(lastEntryAt: Date): Date {
  const cycleEnd = nextFridayAtOrAfter(lastEntryAt);
  return new Date(cycleEnd.getTime() + WEEK_MS);
}

export type CadenceRuleLike = {
  cadence_type: string;
  cadence_days: number;
  warning_days: number;
};

export type ComputedRegisterStatus = {
  status: RegisterHealthStatus;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  /** Wall-clock for the next deadline. null for event-driven / never-used. */
  nextDueAt: Date | null;
};

/**
 * Single canonical compute for register due/overdue/due-soon status.
 * Honored by both `getComplianceRegisterHealth()` (server component) and
 * `/api/registers/compliance-health` (client fetch). Do NOT inline a
 * second copy of this anywhere — the previous duplicate in the API route
 * caused the "Due in 6d → Due Soon" bug because it didn't read
 * warning_days from the cadence rule and didn't anchor weekly cadence
 * to Friday 17:00 UTC.
 */
export function computeHealthStatus(
  lastEntryAt: Date | null,
  rule: CadenceRuleLike | null,
  fallbackCadenceDays: number | null,
  now: Date = new Date()
): ComputedRegisterStatus {
  const cadenceDays = rule?.cadence_days ?? fallbackCadenceDays ?? null;
  // Honor warning_days from the cadence rules JSON instead of the legacy
  // hardcoded 7-day threshold. Weekly registers use 2; quarterly use 14;
  // each register tunes its own due-soon window via data, not code.
  const warningDays = rule?.warning_days ?? 7;
  const cadenceType = rule?.cadence_type ?? null;

  // Event-driven (cadence_days = 0): no scheduled deadline. The register
  // is "current" as soon as anything has been logged.
  if (cadenceDays === null || cadenceDays === 0) {
    if (!lastEntryAt) return { status: "never_used", daysOverdue: null, daysUntilDue: null, nextDueAt: null };
    return { status: "current", daysOverdue: null, daysUntilDue: null, nextDueAt: null };
  }
  if (!lastEntryAt) {
    return { status: "never_used", daysOverdue: null, daysUntilDue: null, nextDueAt: null };
  }

  // Weekly cadence is anchored to Friday 17:00 UTC; everything else uses
  // a sliding window from the last entry. We can extend the anchor model
  // to monthly/quarterly/annual later if needed.
  const nextDue =
    cadenceType === "weekly"
      ? nextWeeklyDeadline(lastEntryAt)
      : new Date(lastEntryAt.getTime() + cadenceDays * DAY_MS);

  const msUntil = nextDue.getTime() - now.getTime();
  const daysUntil = Math.ceil(msUntil / DAY_MS);
  if (msUntil < 0) return { status: "overdue", daysOverdue: Math.abs(daysUntil), daysUntilDue: null, nextDueAt: nextDue };
  if (daysUntil <= warningDays) return { status: "due_soon", daysOverdue: null, daysUntilDue: daysUntil, nextDueAt: nextDue };
  return { status: "current", daysOverdue: null, daysUntilDue: daysUntil, nextDueAt: nextDue };
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
    // Cadence rule carries cadence_type (drives weekly Friday-anchor) and
    // warning_days (per-register due-soon threshold).
    const rule = getCadenceRuleByRegisterId(schema.register_id);

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

    const { status, daysOverdue, daysUntilDue } = computeHealthStatus(
      lastEntryAt,
      rule,
      effectiveCadence
    );
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

/**
 * Alias-aware helpers: schema ids (from CONTROL_INTELLIGENCE) and seed-data
 * registerKeys (on governance_registers rows) diverge for 14 of 24
 * registers. When callers have a schema id and need to query org-side maps
 * keyed by seed-data registerKey, these helpers try both vocabularies.
 */
export function finalCountForSchemaId(
  finalCountsByRegisterKey: Map<string, number>,
  schemaId: string
): number {
  for (const k of resolveRegisterKeyCandidates(schemaId)) {
    const n = finalCountsByRegisterKey.get(k);
    if (n && n > 0) return n;
  }
  return 0;
}

export function isProvisionedForSchemaId(
  provisionedKeys: Set<string>,
  schemaId: string
): boolean {
  return resolveRegisterKeyCandidates(schemaId).some((k) => provisionedKeys.has(k));
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
