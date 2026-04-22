/**
 * GET /api/registers/compliance-health
 *
 * Returns the compliance health status for all required C3PAO registers.
 * Used by the Compliance Registers dashboard client component.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getRegisterSchemas } from "@/data/cmmc/register-schemas";
import { CONTROL_INTELLIGENCE, cadenceToDays } from "@/data/cmmc/control-intelligence";
import { REGISTER_DISPLAY_NAMES, type RegisterHealthStatus } from "@/lib/registers/compliance-health";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";

export type { RegisterHealthStatus };

export type ComplianceRegisterHealth = {
  registerId: string;
  registerKey: string;
  displayName: string;
  description: string;
  cadenceDays: number | null;
  cadenceLabel: string;
  controlIds: string[];
  lastEntryAt: string | null;
  nextDueAt: string | null;
  status: RegisterHealthStatus;
  /**
   * True when the register is event-driven (cadence_days = 0). Event-driven
   * registers legitimately have no entries when the triggering event has not
   * occurred — so empty-and-provisioned is the correct steady state, not a
   * gap.
   */
  eventDriven: boolean;
  entryCount: number;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  href: string;
};

function computeStatus(
  lastEntryAt: Date | null,
  cadenceDays: number | null
): { status: RegisterHealthStatus; daysOverdue: number | null; daysUntilDue: number | null; nextDueAt: Date | null } {
  if (cadenceDays === null || cadenceDays === 0) {
    if (!lastEntryAt) return { status: "never_used", daysOverdue: null, daysUntilDue: null, nextDueAt: null };
    return { status: "current", daysOverdue: null, daysUntilDue: null, nextDueAt: null };
  }
  if (!lastEntryAt) {
    return { status: "never_used", daysOverdue: null, daysUntilDue: null, nextDueAt: null };
  }
  const cadenceMs = cadenceDays * 86_400_000;
  const nextDueAt = new Date(lastEntryAt.getTime() + cadenceMs);
  const msUntilDue = nextDueAt.getTime() - Date.now();
  const daysUntilDue = Math.ceil(msUntilDue / 86_400_000);
  if (msUntilDue < 0) return { status: "overdue", daysOverdue: Math.abs(daysUntilDue), daysUntilDue: null, nextDueAt };
  if (daysUntilDue <= 7) return { status: "due_soon", daysOverdue: null, daysUntilDue, nextDueAt };
  return { status: "current", daysOverdue: null, daysUntilDue, nextDueAt };
}

export async function GET() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schemas = getRegisterSchemas().registerSchemas;

  // Build register -> control IDs map from intelligence data
  const intelligenceByRegister = new Map<string, string[]>();
  for (const intel of CONTROL_INTELLIGENCE) {
    if (intel.registerSchemaId && intel.registerRequired) {
      const arr = intelligenceByRegister.get(intel.registerSchemaId) ?? [];
      if (!arr.includes(intel.controlId)) arr.push(intel.controlId);
      intelligenceByRegister.set(intel.registerSchemaId, arr);
    }
  }

  const orgRegisters = await db
    .select()
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));
  const orgRegisterMap = new Map(orgRegisters.map((r) => [r.registerKey, r]));

  const results: ComplianceRegisterHealth[] = [];

  for (const schema of schemas) {
    // Show every register schema — even ones without an explicit
    // CONTROL_INTELLIGENCE mapping (e.g., audit_config, facility_access,
    // media_access, role_assignment_matrix, baseline_config,
    // technical_compliance_run). These are still CMMC-required records
    // an examiner will request; filtering them out hid them from the
    // dashboard and made the count look short.
    const controlIds = intelligenceByRegister.get(schema.register_id) ?? [];

    const orgRegister = orgRegisterMap.get(schema.register_id);
    const cadenceDays = orgRegister?.defaultCadenceDays ?? schema.default_cadence_days ?? null;
    const effectiveCadence = !cadenceDays || cadenceDays === 0 ? null : cadenceDays;

    let lastEntryAt: Date | null = null;
    let entryCount = 0;

    if (orgRegister) {
      const [latest] = await db
        .select({ createdAt: governanceRegisterEntries.createdAt })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, orgRegister.id))
        .orderBy(desc(governanceRegisterEntries.createdAt))
        .limit(1);
      if (latest) lastEntryAt = new Date(latest.createdAt);

      const all = await db
        .select({ id: governanceRegisterEntries.id })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, orgRegister.id));
      entryCount = all.length;
    }

    const { status, daysOverdue, daysUntilDue, nextDueAt } = computeStatus(lastEntryAt, effectiveCadence);

    const displayName = REGISTER_DISPLAY_NAMES[schema.register_id] ?? schema.register_id;
    const description = schema.description ?? "";

    const cadenceLabelStr = !effectiveCadence ? "Per event"
      : effectiveCadence <= 7 ? "Weekly"
      : effectiveCadence <= 30 ? "Monthly"
      : effectiveCadence <= 90 ? "Quarterly"
      : "Annual";

    const cadenceRule = getCadenceRuleByRegisterId(schema.register_id);
    const eventDriven = cadenceRule?.cadence_days === 0;

    results.push({
      registerId: orgRegister?.id ?? "",
      registerKey: schema.register_id,
      displayName,
      description,
      cadenceDays: effectiveCadence,
      cadenceLabel: cadenceLabelStr,
      controlIds,
      lastEntryAt: lastEntryAt?.toISOString() ?? null,
      nextDueAt: nextDueAt?.toISOString() ?? null,
      status,
      eventDriven,
      entryCount,
      daysOverdue: daysOverdue ?? null,
      daysUntilDue: daysUntilDue ?? null,
      href: `/dashboard/evidence-engine/registers/${schema.register_id}`,
    });
  }

  const ORDER: Record<RegisterHealthStatus, number> = { overdue: 0, due_soon: 1, never_used: 2, current: 3 };
  results.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.displayName.localeCompare(b.displayName));

  return NextResponse.json(results);
}
