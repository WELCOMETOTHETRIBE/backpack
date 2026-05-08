/**
 * SSP draft MDX generator: substitute placeholders from Evidence Engine data.
 * operational_evidence_summary = latest final entry (in cadence) per register, rendered via field labels.
 * frequency = cadence from register stats. implementation_summary, tools, responsible_roles, artifacts = placeholder (user-fillable).
 */
import { db } from "@/db";
import { boundaries, governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getSSPNarrativeTemplates } from "@/data/cmmc";
import { getSummaryTemplate, renderSummary, getFallbackSummary } from "@/data/cmmc/field-labels-and-summaries";
import { getRegisterStatsForOrgAndBoundary } from "./control-dashboard";

const USER_FILLABLE = "[To be completed]";

/**
 * Substitute {{key}} in template with values from map. Keys not in map get USER_FILLABLE.
 */
function substitutePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? USER_FILLABLE);
}

function cloudProviderLabel(cloudProvider: string | null, azureEnvironment: string | null): string {
  if (!cloudProvider || cloudProvider === "none") return "On Prem";
  if (cloudProvider === "microsoft" || cloudProvider === "azure") {
    return azureEnvironment === "gov" ? "Microsoft Azure Government" : "Microsoft Azure Commercial";
  }
  if (cloudProvider === "google") return "Google Cloud";
  return cloudProvider;
}

/**
 * For each register key, get the latest final entry that is "in cadence" (finalizedAt within cadence window, or any final if event-driven).
 * Scoped to boundaryId. Returns map registerKey -> { entryData, entryType } for building summary.
 */
async function getLatestFinalEntryPerRegister(
  orgId: string,
  boundaryId: string,
  statsByRegister: Map<string, { lastFinalizedAt: Date | null; cadenceDays: number; registerHealth: string }>
): Promise<Map<string, { entryData: Record<string, unknown>; entryType: string }>> {
  const orgRegs = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const regIdToKey = new Map(orgRegs.map((r) => [r.id, r.registerKey]));
  const registerIds = orgRegs.map((r) => r.id);
  if (registerIds.length === 0) return new Map();

  const now = new Date();
  const entries = await db
    .select({
      registerId: governanceRegisterEntries.registerId,
      entryData: governanceRegisterEntries.entryData,
      entryType: governanceRegisterEntries.entryType,
      finalizedAt: governanceRegisterEntries.finalizedAt,
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
    .orderBy(desc(governanceRegisterEntries.finalizedAt));

  const byRegister = new Map<string, { entryData: Record<string, unknown>; entryType: string; finalizedAt: Date }[]>();
  for (const e of entries) {
    const key = regIdToKey.get(e.registerId);
    if (!key) continue;
    if (!registerIds.includes(e.registerId)) continue;
    const list = byRegister.get(key) ?? [];
    list.push({
      entryData: (e.entryData ?? {}) as Record<string, unknown>,
      entryType: e.entryType ?? "unknown",
      finalizedAt: e.finalizedAt!,
    });
    byRegister.set(key, list);
  }

  const result = new Map<string, { entryData: Record<string, unknown>; entryType: string }>();
  for (const [registerKey, list] of byRegister) {
    const stats = statsByRegister.get(registerKey);
    const cadenceDays = stats?.cadenceDays ?? 90;
    const eventDriven = cadenceDays === 0;
    const windowStart = eventDriven ? null : new Date(now.getTime() - cadenceDays * 86400000);
    const inCadence = list.find(
      (x) => eventDriven || (windowStart && x.finalizedAt >= windowStart)
    );
    const entry = inCadence ?? list[0];
    if (entry) result.set(registerKey, { entryData: entry.entryData, entryType: entry.entryType });
  }
  return result;
}

/**
 * Build full SSP draft MDX for the org and boundary. Includes System Boundary section and substitutes
 * operational_evidence_summary and frequency from Evidence Engine; other placeholders get USER_FILLABLE.
 */
export async function buildSSPMdx(orgId: string, boundaryId: string): Promise<string> {
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  if (!boundary) throw new Error("Boundary not found");

  const templates = getSSPNarrativeTemplates();
  const statsByRegister = await getRegisterStatsForOrgAndBoundary(orgId, boundaryId);
  const statsForSubst = new Map(
    [...statsByRegister.entries()].map(([k, v]) => [
      k,
      {
        lastFinalizedAt: v.lastFinalizedAt,
        cadenceDays: v.cadenceDays,
        registerHealth: v.registerHealth,
      },
    ])
  );
  const latestEntryByRegister = await getLatestFinalEntryPerRegister(orgId, boundaryId, statsForSubst);

  const componentsStr = Array.isArray(boundary.scopeComponents) && boundary.scopeComponents.length > 0
    ? boundary.scopeComponents.join(", ")
    : "—";
  const hostingPlatform = cloudProviderLabel(boundary.cloudProvider, boundary.azureEnvironment);
  const cloudEnv = boundary.azureEnvironment === "gov" ? "Gov" : boundary.azureEnvironment === "commercial" ? "Commercial" : "—";

  const boundarySection = [
    "## System Boundary",
    "",
    "**Name:** " + boundary.name,
    "",
    "**Components:** " + componentsStr,
    "",
    "**Cloud Provider:** " + hostingPlatform,
    "",
    "**Cloud Environment:** " + cloudEnv,
    "",
  ].join("\n");

  const sections: string[] = [boundarySection];
  for (const control of templates.controls) {
    const parts: string[] = [];
    for (const registerKey of control.mapped_registers) {
      const entry = latestEntryByRegister.get(registerKey);
      if (entry) {
        const template = getSummaryTemplate(registerKey, entry.entryType);
        const summary = template
          ? renderSummary(template, entry.entryData)
          : getFallbackSummary(entry.entryType, entry.entryData);
        parts.push(summary);
      }
    }
    const operational_evidence_summary = parts.length > 0 ? parts.join(" ") : "No finalized evidence in cadence for mapped registers.";
    const cadenceParts: string[] = [];
    for (const registerKey of control.mapped_registers) {
      const stats = statsByRegister.get(registerKey);
      const days = stats?.cadenceDays ?? 90;
      if (days === 0) cadenceParts.push("Event-driven (no fixed due date)");
      else cadenceParts.push(`Every ${days} days`);
    }
    const frequency = [...new Set(cadenceParts)].join("; ") || "—";

    const values: Record<string, string> = {
      implementation_summary: USER_FILLABLE,
      operational_evidence_summary,
      tools: USER_FILLABLE,
      responsible_roles: USER_FILLABLE,
      frequency,
      artifacts: USER_FILLABLE,
    };
    const mdx = substitutePlaceholders(control.template_mdx, values);
    sections.push(mdx);
  }
  return sections.join("\n\n");
}
