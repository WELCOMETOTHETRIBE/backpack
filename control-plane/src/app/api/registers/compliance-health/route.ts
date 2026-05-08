/**
 * GET /api/registers/compliance-health
 *
 * Returns the compliance health status for all required C3PAO registers.
 * Used by the Compliance Registers dashboard client component.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries, controlRecords } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getRegisterSchemas } from "@/data/cmmc/register-schemas";
import { CONTROL_INTELLIGENCE, cadenceToDays } from "@/data/cmmc/control-intelligence";
import {
  REGISTER_DISPLAY_NAMES,
  computeHealthStatus,
  type RegisterHealthStatus,
} from "@/lib/registers/compliance-health";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

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
  /**
   * True when every control mapped to this register has
   * implementationStatus ∈ { "inherited", "not_applicable" } for this org —
   * so the register itself has no active obligation. Surface as "N/A" in
   * the UI rather than as outstanding work; keep the row visible for
   * traceability.
   */
  notApplicable: boolean;
  entryCount: number;
  daysOverdue: number | null;
  daysUntilDue: number | null;
  href: string;
};

// Status compute moved to src/lib/registers/compliance-health.ts as
// computeHealthStatus() — single canonical source of truth for both the
// /dashboard server component and this client-fetched API route. The old
// duplicate that lived here had a hardcoded <=7d due-soon threshold and
// no Friday anchor, producing wrong status badges on weekly registers
// (e.g. audit_log_review showing "Due Soon" with 6 days remaining when
// its warning_days is 2). See git history if you need the old version.

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

  // Control statuses for N/A cascading — a register whose every mapped
  // control is inherited or not_applicable has no active obligation for
  // this org, so we surface it as N/A instead of outstanding.
  const orgControlRecords = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));
  const controlStatusById = new Map(
    orgControlRecords.map((r) => [r.controlId, r.implementationStatus])
  );
  const NON_APPLICABLE = new Set(["inherited", "not_applicable"]);

  const results: ComplianceRegisterHealth[] = [];

  for (const schema of schemas) {
    // Show every register schema — even ones without an explicit
    // CONTROL_INTELLIGENCE mapping (e.g., audit_config, facility_access,
    // media_access, role_assignment_matrix, baseline_config,
    // technical_compliance_run). These are still CMMC-required records
    // an examiner will request; filtering them out hid them from the
    // dashboard and made the count look short.
    const controlIds = intelligenceByRegister.get(schema.register_id) ?? [];

    // Seed-data registerKeys don't always match schema register_ids (e.g.
    // schema "termination" ↔ seed "terminations"). Try every alias so the
    // org register row actually gets found.
    const candidates = resolveRegisterKeyCandidates(schema.register_id);
    let orgRegister: (typeof orgRegisters)[number] | undefined;
    for (const k of candidates) {
      const hit = orgRegisterMap.get(k);
      if (hit) { orgRegister = hit; break; }
    }
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

    const cadenceRule = getCadenceRuleByRegisterId(schema.register_id);
    const computed = computeHealthStatus(lastEntryAt, cadenceRule, effectiveCadence);
    const displayName = REGISTER_DISPLAY_NAMES[schema.register_id] ?? schema.register_id;
    const description = schema.description ?? "";

    const cadenceLabelStr = !effectiveCadence ? "Per event"
      : effectiveCadence <= 7 ? "Weekly"
      : effectiveCadence <= 30 ? "Monthly"
      : effectiveCadence <= 90 ? "Quarterly"
      : "Annual";

    // cadenceRule already loaded above for computeHealthStatus
    const eventDriven = cadenceRule?.cadence_days === 0;

    // N/A cascade: if every control mapped to this register is inherited or
    // not_applicable for this org, the register itself has no active
    // obligation. Only applies when there IS at least one mapped control —
    // registers with no control-intelligence mapping (e.g., audit_config,
    // facility_access) are still tracked independently.
    const notApplicable =
      controlIds.length > 0 &&
      controlIds.every((cid) => {
        const s = controlStatusById.get(cid);
        return s !== undefined && NON_APPLICABLE.has(s);
      });

    // Event-driven registers with zero entries (while provisioned) are the
    // correct steady state — no incidents, no terminations, no events to
    // log. Promote them from "never_used" to "current" so summary counts,
    // filter chips, and banners all treat them as satisfied. The
    // eventDriven flag keeps a distinctive "Ready — no events" label
    // available in the UI. N/A registers are likewise treated as
    // satisfied (current) — nothing is outstanding.
    const provisioned = !!orgRegister;
    const effectiveStatus: RegisterHealthStatus =
      notApplicable ||
      (eventDriven && provisioned && entryCount === 0)
        ? "current"
        : computed.status;

    results.push({
      registerId: orgRegister?.id ?? "",
      registerKey: schema.register_id,
      displayName,
      description,
      cadenceDays: effectiveCadence,
      cadenceLabel: cadenceLabelStr,
      controlIds,
      lastEntryAt: lastEntryAt?.toISOString() ?? null,
      nextDueAt: computed.nextDueAt?.toISOString() ?? null,
      status: effectiveStatus,
      eventDriven,
      notApplicable,
      entryCount,
      daysOverdue: computed.daysOverdue ?? null,
      daysUntilDue: computed.daysUntilDue ?? null,
      href: `/dashboard/evidence-engine/registers/${schema.register_id}`,
    });
  }

  const ORDER: Record<RegisterHealthStatus, number> = { overdue: 0, due_soon: 1, never_used: 2, current: 3 };
  results.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.displayName.localeCompare(b.displayName));

  return NextResponse.json(results);
}
