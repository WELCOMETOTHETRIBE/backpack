/**
 * Evidence Engine control dashboard: coverage and last evidence from register entries.
 * All control/register definitions come from artifacts; DB holds entries only.
 */
import { db } from "@/db";
import { boundaries, governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { getEvidenceMap } from "@/data/cmmc";
import { getRegisterSchemaByRegisterId } from "@/data/cmmc/register-schemas";
import { getRegisterCadenceRules, getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";

export type RegisterHealth = "healthy" | "due" | "overdue" | "event_driven";

export type LastEvidenceType = "final" | "draft" | "void" | "none";

export type RegisterStats = {
  registerKey: string;
  hasFinalInCadence: boolean;
  lastFinalizedAt: Date | null;
  /** Next due date = lastFinalizedAt + cadenceDays; null if no final entry ever. */
  nextDueAt: Date | null;
  /** healthy | due (within warning window) | overdue (no entry or past due). */
  registerHealth: RegisterHealth;
  cadenceDays: number;
  /** True if register has at least one entry (draft or final). Used for confidence 50% vs 0%. */
  hasAnyEntry: boolean;
  /** Timestamp of the most recent entry (any status). */
  lastEntryAt: Date | null;
  /** Status of the most recent entry; "none" if no entries. */
  lastEntryStatus: "draft" | "final" | "void" | "none";
  /** Same as lastEntryStatus; human-facing label. */
  lastEvidenceType: LastEvidenceType;
  /** Human-readable explanation for registerHealth (for tooltips). */
  registerHealthReason: string;
};

export type ControlRow = {
  controlId: string;
  family: string;
  registers: string[];
  coverageStatus: "green" | "yellow" | "red" | "na";
  lastEvidenceDate: Date | null;
  /** True if any mapped register is overdue. */
  isOverdue?: boolean;
};

const CADENCE_DEFAULT_DAYS = 90;

/** Build human-readable reason for register health (for tooltips). Optional now for tests. */
export function buildRegisterHealthReason(
  registerHealth: RegisterHealth,
  opts: {
    lastFinalizedAt: Date | null;
    nextDueAt: Date | null;
    cadenceDays: number;
    warningDays: number;
  },
  now: Date = new Date()
): string {
  const { lastFinalizedAt, nextDueAt, cadenceDays, warningDays } = opts;
  if (registerHealth === "event_driven") {
    return "Event-driven register (no fixed due date). Requires ≥1 finalized entry.";
  }
  if (registerHealth === "healthy" && lastFinalizedAt) {
    const daysAgo = Math.floor((now.getTime() - lastFinalizedAt.getTime()) / 86400000);
    return `Last finalized entry ${daysAgo} days ago; cadence ${cadenceDays} days.`;
  }
  if (registerHealth === "due" && nextDueAt) {
    const daysUntil = Math.ceil((nextDueAt.getTime() - now.getTime()) / 86400000);
    return `Next due in ${daysUntil} days (cadence ${cadenceDays} days; warning ${warningDays} days).`;
  }
  if (registerHealth === "overdue") {
    if (lastFinalizedAt == null || nextDueAt == null) {
      return `No finalized entry; cadence ${cadenceDays} days.`;
    }
    const daysOver = Math.ceil((now.getTime() - nextDueAt.getTime()) / 86400000);
    const daysSinceFinal = Math.floor((now.getTime() - lastFinalizedAt.getTime()) / 86400000);
    return `Overdue by ${daysOver} days (last finalized ${daysSinceFinal} days ago; cadence ${cadenceDays} days).`;
  }
  return "";
}

/**
 * Ensure org has a register row for each Evidence Engine register. Seeds from a
 * global template row (organizationId IS NULL) when present, otherwise falls
 * back to the evidence map + register entry schema artifacts so an org always
 * ends up with a row for every register id declared in the evidence map.
 */
export async function ensureEvidenceEngineRegistersForOrg(orgId: string): Promise<void> {
  const evidenceMap = getEvidenceMap();
  const registers = evidenceMap.registers;

  const templates = await db
    .select()
    .from(governanceRegisters)
    .where(sql`${governanceRegisters.organizationId} IS NULL`);

  const orgRegisters = await db
    .select({ registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const existingKeys = new Set(orgRegisters.map((r) => r.registerKey));
  const templateByKey = new Map(templates.map((t) => [t.registerKey, t]));

  for (const reg of registers) {
    if (existingKeys.has(reg.id)) continue;
    const template = templateByKey.get(reg.id);
    const schema = getRegisterSchemaByRegisterId(reg.id);
    await db.insert(governanceRegisters).values({
      organizationId: orgId,
      projectId: null,
      registerKey: reg.id,
      name: template?.name ?? reg.name,
      description: template?.description ?? schema?.description ?? null,
      requiredColumns: template?.requiredColumns ?? [],
      retainForDays: template?.retainForDays ?? null,
      defaultCadenceDays: template?.defaultCadenceDays ?? schema?.default_cadence_days ?? null,
    });
    existingKeys.add(reg.id);
  }
}

/**
 * Get per-register stats for the org and boundary: has final entry in cadence window, and last finalized_at.
 * Keys are register_key (from evidence map id). All entry queries are scoped to boundaryId.
 */
export async function getRegisterStatsForOrgAndBoundary(
  orgId: string,
  boundaryId: string
): Promise<Map<string, RegisterStats>> {
  const evidenceMap = getEvidenceMap();
  const registerIds = evidenceMap.registers.map((r) => r.id);

  const orgRegs = await db
    .select({
      id: governanceRegisters.id,
      registerKey: governanceRegisters.registerKey,
      defaultCadenceDays: governanceRegisters.defaultCadenceDays,
      cadenceOverrideDays: governanceRegisters.cadenceOverrideDays,
    })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const regIdToRow = new Map(orgRegs.map((r) => [r.registerKey, r]));
  const result = new Map<string, RegisterStats>();

  const cadenceRulesArtifact = getRegisterCadenceRules();
  const defaultWarningDays = cadenceRulesArtifact.defaults?.due_soon_days ?? 14;

  function getCadenceDays(registerKey: string, reg: { defaultCadenceDays: number | null; cadenceOverrideDays: number | null }): number {
    if (reg.cadenceOverrideDays != null) return reg.cadenceOverrideDays;
    const rule = getCadenceRuleByRegisterId(registerKey);
    if (rule != null) {
      if (rule.cadence_days === 0) return 0;
      return rule.cadence_days;
    }
    if (reg.defaultCadenceDays != null) return reg.defaultCadenceDays;
    const schema = getRegisterSchemaByRegisterId(registerKey);
    return schema?.default_cadence_days ?? CADENCE_DEFAULT_DAYS;
  }

  function getWarningDays(registerKey: string): number {
    const rule = getCadenceRuleByRegisterId(registerKey);
    if (rule != null && rule.warning_days > 0) return rule.warning_days;
    return defaultWarningDays;
  }

  function isEventDriven(registerKey: string): boolean {
    const rule = getCadenceRuleByRegisterId(registerKey);
    return rule != null && rule.cadence_days === 0;
  }

  function computeRegisterHealth(
    lastFinalizedAt: Date | null,
    cadenceDays: number,
    registerKey: string
  ): { nextDueAt: Date | null; registerHealth: RegisterHealth } {
    const now = new Date();
    if (isEventDriven(registerKey)) {
      return { nextDueAt: null, registerHealth: "event_driven" };
    }
    if (lastFinalizedAt == null) {
      return { nextDueAt: null, registerHealth: "overdue" };
    }
    const nextDueAt = new Date(lastFinalizedAt);
    nextDueAt.setDate(nextDueAt.getDate() + cadenceDays);
    if (now > nextDueAt) return { nextDueAt, registerHealth: "overdue" };
    const warningDays = getWarningDays(registerKey);
    const warningStart = new Date(nextDueAt);
    warningStart.setDate(warningStart.getDate() - warningDays);
    if (now >= warningStart) return { nextDueAt, registerHealth: "due" };
    return { nextDueAt, registerHealth: "healthy" };
  }

  for (const registerKey of registerIds) {
    const reg = orgRegs.find((r) => r.registerKey === registerKey);
    const cadenceDays = reg ? getCadenceDays(registerKey, reg) : CADENCE_DEFAULT_DAYS;
    const { nextDueAt, registerHealth } = computeRegisterHealth(null, cadenceDays, registerKey);
    const warningDays = getWarningDays(registerKey);
    const registerHealthReason = buildRegisterHealthReason(
      registerHealth,
      { lastFinalizedAt: null, nextDueAt, cadenceDays, warningDays }
    );
    result.set(registerKey, {
      registerKey,
      hasFinalInCadence: false,
      lastFinalizedAt: null,
      nextDueAt,
      registerHealth,
      cadenceDays,
      hasAnyEntry: false,
      lastEntryAt: null,
      lastEntryStatus: "none",
      lastEvidenceType: "none",
      registerHealthReason,
    });
  }

  const latestEntryResult = await db.execute(sql`
    SELECT DISTINCT ON (e.register_id) e.register_id, e.status, e.created_at
    FROM governance_register_entries e
    INNER JOIN governance_registers r ON r.id = e.register_id
    WHERE r.organization_id = ${orgId} AND e.boundary_id = ${boundaryId}
    ORDER BY e.register_id, e.created_at DESC
  `);
  const latestRows = Array.isArray(latestEntryResult)
    ? latestEntryResult
    : (latestEntryResult as { rows?: { register_id: string; status: string; created_at: Date }[] }).rows ?? [];
  const latestByRegId = new Map<
    string,
    { status: "draft" | "final" | "void"; createdAt: Date }
  >();
  for (const row of latestRows) {
    const status = row.status === "final" ? "final" : row.status === "void" ? "void" : "draft";
    const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string | number);
    latestByRegId.set(String(row.register_id), { status, createdAt });
  }

  const totalCountByRegister = await db
    .select({
      registerId: governanceRegisterEntries.registerId,
      total: sql<number>`count(*)::int`.as("total"),
    })
    .from(governanceRegisterEntries)
    .innerJoin(governanceRegisters, eq(governanceRegisterEntries.registerId, governanceRegisters.id))
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisterEntries.boundaryId, boundaryId)
      )
    )
    .groupBy(governanceRegisterEntries.registerId);

  const totalByRegId = new Map(totalCountByRegister.map((r) => [r.registerId, r.total ?? 0]));

  const aggregated = await db
    .select({
      registerId: governanceRegisterEntries.registerId,
      lastFinalizedAt: sql<Date | null>`max(${governanceRegisterEntries.finalizedAt})`.as("last_finalized_at"),
    })
    .from(governanceRegisterEntries)
    .innerJoin(governanceRegisters, eq(governanceRegisterEntries.registerId, governanceRegisters.id))
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisterEntries.boundaryId, boundaryId),
        eq(governanceRegisterEntries.status, "final"),
        sql`${governanceRegisterEntries.finalizedAt} IS NOT NULL`
      )
    )
    .groupBy(governanceRegisterEntries.registerId);

  const now = new Date();
  for (const row of aggregated) {
    const reg = orgRegs.find((r) => r.id === row.registerId);
    if (!reg) continue;
    const registerKey = reg.registerKey;
    const lastFinalizedAt = row.lastFinalizedAt ? new Date(row.lastFinalizedAt) : null;
    const cadenceDays = getCadenceDays(registerKey, reg);
    const eventDriven = isEventDriven(registerKey);
    const since = new Date(now);
    since.setDate(since.getDate() - (eventDriven ? 0 : cadenceDays));
    const hasFinalInCadence = lastFinalizedAt != null && (eventDriven || lastFinalizedAt >= since);
    const { nextDueAt, registerHealth } = computeRegisterHealth(lastFinalizedAt, cadenceDays, registerKey);
    const hasAnyEntry = (totalByRegId.get(row.registerId) ?? 0) > 0;
    const warningDays = getWarningDays(registerKey);
    const registerHealthReason = buildRegisterHealthReason(
      registerHealth,
      { lastFinalizedAt, nextDueAt, cadenceDays, warningDays }
    );
    result.set(registerKey, {
      registerKey,
      hasFinalInCadence,
      lastFinalizedAt,
      nextDueAt,
      registerHealth,
      cadenceDays,
      hasAnyEntry,
      lastEntryAt: null,
      lastEntryStatus: "none",
      lastEvidenceType: "none",
      registerHealthReason,
    });
  }
  for (const [registerKey, stats] of result) {
    const reg = orgRegs.find((r) => r.registerKey === registerKey);
    const latest = reg ? latestByRegId.get(reg.id) : undefined;
    if (latest) {
      result.set(registerKey, {
        ...stats,
        lastEntryAt: latest.createdAt,
        lastEntryStatus: latest.status,
        lastEvidenceType: latest.status,
      });
    }
  }
  return result;
}

/**
 * Get per-register stats for the org (uses first boundary for backward compatibility).
 * Prefer getRegisterStatsForOrgAndBoundary(orgId, boundaryId) when boundary is known.
 */
export async function getRegisterStatsForOrg(orgId: string): Promise<Map<string, RegisterStats>> {
  const first = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .orderBy(asc(boundaries.createdAt))
    .limit(1);
  const boundaryId = first[0]?.id;
  if (!boundaryId) return new Map();
  return getRegisterStatsForOrgAndBoundary(orgId, boundaryId);
}

/**
 * Compute control dashboard rows from evidence map and register stats.
 * Optionally filter to only overdue controls (any mapped register overdue).
 */
export function computeControlRows(
  statsByRegister: Map<string, RegisterStats>,
  options?: { onlyOverdue?: boolean }
): ControlRow[] {
  const evidenceMap = getEvidenceMap();
  let rows: ControlRow[] = evidenceMap.controls.map((c) => {
    const registers = c.registers ?? [];
    const noRegistersRequired = !c.operational_evidence?.register_entries_required;

    let coverageStatus: ControlRow["coverageStatus"] = "red";
    let lastEvidenceDate: Date | null = null;
    let isOverdue = false;

    if (noRegistersRequired || registers.length === 0) {
      coverageStatus = "na";
    } else {
      const withEvidence = registers.filter((rk) => statsByRegister.get(rk)?.hasFinalInCadence);
      const withAnyDate = registers
        .map((rk) => statsByRegister.get(rk)?.lastFinalizedAt)
        .filter((d): d is Date => d != null);
      if (withAnyDate.length > 0) {
        lastEvidenceDate = new Date(Math.max(...withAnyDate.map((d) => d.getTime())));
      }
      if (withEvidence.length === registers.length) coverageStatus = "green";
      else if (withEvidence.length > 0) coverageStatus = "yellow";
      isOverdue = registers.some((rk) => statsByRegister.get(rk)?.registerHealth === "overdue");
    }

    return {
      controlId: c.control_id,
      family: c.family,
      registers: [...registers],
      coverageStatus,
      lastEvidenceDate,
      isOverdue,
    };
  });
  if (options?.onlyOverdue) {
    rows = rows.filter((r) => r.isOverdue === true);
  }
  return rows;
}
