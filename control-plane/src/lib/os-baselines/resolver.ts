/**
 * Resolve applicable technical controls and baseline checks for an OS asset.
 * ApplicableControls = baseline_control (required) for the asset's profile,
 * optionally filtered by portal coverage_type (host_evidence | hybrid).
 */
import { db } from "@/db";
import { osAssets, baselineControls, baselineChecks } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getPortalControlSchema } from "@/lib/compliance/schemas";

export type ApplicableControl = {
  controlId: string;
  applicability: string;
  rationale: string | null;
};

export type BaselineCheckRow = {
  checkId: string;
  controlId: string;
  expectedSetting: string;
  evidenceRequiredFiles: string[];
  validation: unknown;
  remediationGuidance: string | null;
  manualCommands: string[] | null;
};

export type ResolvedApplicable = {
  controls: ApplicableControl[];
  checksByControlId: Record<string, BaselineCheckRow[]>;
};

const HOST_APPLICABLE_COVERAGE = ["host_evidence", "hybrid"] as const;

function getPortalCoverageType(controlId: string): string | undefined {
  const portal = getPortalControlSchema();
  const controls = (portal?.controls ?? []) as Array<{
    control_id: string;
    coverage_type?: string;
  }>;
  const c = controls.find((x) => x.control_id === controlId);
  return c?.coverage_type;
}

/**
 * Resolve applicable controls and checks for an OS asset.
 * When the asset has a baseline profile, returns required controls (optionally
 * filtered to host_evidence/hybrid per portal schema) and all baseline checks
 * for those controls.
 */
export async function resolveApplicableControls(osAsset: {
  id: string;
  baselineProfileId: string | null;
}): Promise<ResolvedApplicable> {
  const empty: ResolvedApplicable = { controls: [], checksByControlId: {} };

  if (!osAsset.baselineProfileId) {
    return empty;
  }

  const profileId = osAsset.baselineProfileId;

  const controlRows = await db
    .select({
      controlId: baselineControls.controlId,
      applicability: baselineControls.applicability,
      rationale: baselineControls.rationale,
    })
    .from(baselineControls)
    .where(
      and(
        eq(baselineControls.baselineProfileId, profileId),
        eq(baselineControls.applicability, "required")
      )
    );

  const controlIds = controlRows.map((r) => r.controlId);
  const filteredIds = controlIds.filter((controlId) => {
    const coverage = getPortalCoverageType(controlId);
    if (coverage === undefined) return true;
    return HOST_APPLICABLE_COVERAGE.includes(
      coverage as (typeof HOST_APPLICABLE_COVERAGE)[number]
    );
  });

  const controls: ApplicableControl[] = controlRows
    .filter((r) => filteredIds.includes(r.controlId))
    .map((r) => ({
      controlId: r.controlId,
      applicability: r.applicability,
      rationale: r.rationale,
    }));

  if (filteredIds.length === 0) {
    return { controls, checksByControlId: {} };
  }

  const checkRows = await db
    .select()
    .from(baselineChecks)
    .where(
      and(
        eq(baselineChecks.baselineProfileId, profileId),
        inArray(baselineChecks.controlId, filteredIds)
      )
    );

  const checksByControlId: Record<string, BaselineCheckRow[]> = {};
  for (const row of checkRows) {
    const list = checksByControlId[row.controlId] ?? [];
    list.push({
      checkId: row.checkId,
      controlId: row.controlId,
      expectedSetting: row.expectedSetting,
      evidenceRequiredFiles: (row.evidenceRequiredFiles ?? []) as string[],
      validation: row.validation,
      remediationGuidance: row.remediationGuidance,
      manualCommands: (row.manualCommands ?? null) as string[] | null,
    });
    checksByControlId[row.controlId] = list;
  }

  return { controls, checksByControlId };
}

/**
 * Fetch OS asset by id; returns null if not found.
 */
export type OsAssetSummary = {
  id: string;
  organizationId: string;
  boundaryId: string;
  hostname: string;
  osFamily: string;
  osVersion: string;
  role: string;
  baselineProfileId: string | null;
  owner: string | null;
  tags: string[] | null;
};

export async function getOsAssetById(id: string): Promise<OsAssetSummary | null> {
  const [row] = await db
    .select({
      id: osAssets.id,
      organizationId: osAssets.organizationId,
      boundaryId: osAssets.boundaryId,
      hostname: osAssets.hostname,
      osFamily: osAssets.osFamily,
      osVersion: osAssets.osVersion,
      role: osAssets.role,
      baselineProfileId: osAssets.baselineProfileId,
      owner: osAssets.owner,
      tags: osAssets.tags,
    })
    .from(osAssets)
    .where(eq(osAssets.id, id));
  return row ?? null;
}
