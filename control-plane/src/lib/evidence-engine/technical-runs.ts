/**
 * Technical compliance run (collector run) helpers: latest run per boundary, result per control.
 */
import { db } from "@/db";
import { boundaries, governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type TechnicalRunEntry = {
  id: string;
  runId: string;
  overallStatus: string;
  pass: number;
  fail: number;
  warn: number;
  error: number;
  na: number;
  checksTotal: number;
  collectorVersion: string;
  vaultOutputsRoot: string;
  controlResults: Record<string, unknown>;
  createdAt: Date;
  status: string;
};

export type TechnicalResultForControl = {
  status: string;
  check_id?: string;
  title?: string;
  severity?: string;
  observed?: string;
  expected?: string;
  remediation?: string;
  evidence_files?: string[];
  source?: string;
} | null;

/**
 * Get the latest technical compliance run entry for a boundary (final preferred, then draft).
 */
export async function getLatestTechnicalRunForBoundary(boundaryId: string): Promise<TechnicalRunEntry | null> {
  const [boundary] = await db
    .select({ organizationId: boundaries.organizationId })
    .from(boundaries)
    .where(eq(boundaries.id, boundaryId));
  if (!boundary) return null;

  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.registerKey, "technical_compliance_run"),
        eq(governanceRegisters.organizationId, boundary.organizationId)
      )
    );

  if (!register) return null;

  const [entry] = await db
    .select()
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        eq(governanceRegisterEntries.boundaryId, boundaryId)
      )
    )
    .orderBy(desc(governanceRegisterEntries.createdAt))
    .limit(1);

  if (!entry?.entryData || typeof entry.entryData !== "object") return null;

  const data = entry.entryData as Record<string, unknown>;
  return {
    id: entry.id,
    runId: (data.run_id as string) ?? "",
    overallStatus: (data.overall_status as string) ?? "pass",
    pass: (data.pass as number) ?? 0,
    fail: (data.fail as number) ?? 0,
    warn: (data.warn as number) ?? 0,
    error: (data.error as number) ?? 0,
    na: (data.na as number) ?? 0,
    checksTotal: (data.checks_total as number) ?? 0,
    collectorVersion: (data.collector_version as string) ?? "",
    vaultOutputsRoot: (data.vault_outputs_root as string) ?? "",
    controlResults: (data.control_results as Record<string, unknown>) ?? {},
    createdAt: entry.createdAt,
    status: entry.status,
  };
}

/**
 * Get the technical check result for a single control from the latest run in the boundary.
 */
export async function getTechnicalResultForControl(
  boundaryId: string,
  controlId: string
): Promise<TechnicalResultForControl> {
  const run = await getLatestTechnicalRunForBoundary(boundaryId);
  if (!run) return null;
  const result = run.controlResults[controlId];
  if (!result || typeof result !== "object") return null;
  return result as TechnicalResultForControl;
}

export type CombinedTechnicalStatus =
  | { kind: "result"; status: string; result: TechnicalResultForControl; runId: string }
  | { kind: "azure_inherited"; note: string }
  | { kind: "no_run"; note: string };

/**
 * Combined technical evidence status for a control: result from latest run, or NA when azure_inherited and no technical result.
 */
export async function getCombinedTechnicalStatus(
  boundaryId: string,
  controlId: string,
  responsibilityModel: string | null
): Promise<CombinedTechnicalStatus> {
  const result = await getTechnicalResultForControl(boundaryId, controlId);
  const run = await getLatestTechnicalRunForBoundary(boundaryId);

  if (responsibilityModel === "azure_inherited" && !result) {
    return { kind: "azure_inherited", note: "Azure inherited; no technical check in scope." };
  }

  if (!run) {
    return { kind: "no_run", note: "No technical compliance run for this boundary." };
  }

  if (!result) {
    return { kind: "no_run", note: "No technical result for this control in the latest run." };
  }

  return { kind: "result", status: result.status, result, runId: run.runId };
}

/**
 * List technical compliance run entries for a boundary (for Technical Runs section).
 */
export async function getTechnicalRunsForBoundary(
  boundaryId: string,
  limit: number = 20
): Promise<TechnicalRunEntry[]> {
  const [boundary] = await db
    .select({ organizationId: boundaries.organizationId })
    .from(boundaries)
    .where(eq(boundaries.id, boundaryId));
  if (!boundary) return [];

  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.registerKey, "technical_compliance_run"),
        eq(governanceRegisters.organizationId, boundary.organizationId)
      )
    );
  if (!register) return [];

  const entries = await db
    .select()
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        eq(governanceRegisterEntries.boundaryId, boundaryId)
      )
    )
    .orderBy(desc(governanceRegisterEntries.createdAt))
    .limit(limit);

  return entries
    .filter((e) => e.entryData && typeof e.entryData === "object")
    .map((e) => {
      const data = e.entryData as Record<string, unknown>;
      return {
        id: e.id,
        runId: (data.run_id as string) ?? "",
        overallStatus: (data.overall_status as string) ?? "pass",
        pass: (data.pass as number) ?? 0,
        fail: (data.fail as number) ?? 0,
        warn: (data.warn as number) ?? 0,
        error: (data.error as number) ?? 0,
        na: (data.na as number) ?? 0,
        checksTotal: (data.checks_total as number) ?? 0,
        collectorVersion: (data.collector_version as string) ?? "",
        vaultOutputsRoot: (data.vault_outputs_root as string) ?? "",
        controlResults: (data.control_results as Record<string, unknown>) ?? {},
        createdAt: e.createdAt,
        status: e.status,
      };
    });
}
