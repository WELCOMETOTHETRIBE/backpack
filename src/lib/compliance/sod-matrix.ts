/**
 * Separation of Duties matrix — typed accessor over the static mirror of
 * MAC-SOP-235 (CUI Vault).
 *
 * QMS is authoritative; this module is a read-only consumer that:
 *   - feeds the SCTM 3.1.4 matrix viewer,
 *   - drives the preventive provisioning check (rejects role combinations
 *     marked Prohibited before they reach AD),
 *   - drives the detective scan (evaluates exported AD/Entra group
 *     memberships against the matrix and writes sod_findings).
 *
 * The underlying JSON is regenerated/refreshed on MAC-SOP-235 release;
 * the helper here exposes the shape callers actually want.
 */
import sodMatrixJson from "@/data/cmmc/sod_matrix.v1.json";

export type CellDisposition = "P" | "C" | "A";

export interface SodRole {
  id: string;
  code: string;
  name: string;
  summary: string;
  adGroup: string;
  adminTier: string;
  enforcementMechanism: string;
}

export interface SodCompensatingControl {
  pair: [string, string];
  label: string;
  controls: string[];
}

export interface SodLegendEntry {
  label: string;
  color: string;
  description: string;
}

export interface SodMatrixSource {
  documentNumber: string;
  documentName: string;
  version: string;
  releasedAt: string | null;
  sha256: string | null;
  docControlStatus: string;
}

export interface SodMatrix {
  source: SodMatrixSource;
  primaryControl: string;
  crossWalks: string[];
  legend: Record<CellDisposition, SodLegendEntry>;
  roles: SodRole[];
  matrix: Record<string, Record<string, CellDisposition>>;
  compensatingControls: SodCompensatingControl[];
  failOpenSla: { pMinutes: number; cMinutes: number; rationale: string };
}

const raw = sodMatrixJson as unknown as {
  source: {
    document_number: string;
    document_name: string;
    version: string;
    released_at: string | null;
    sha256: string | null;
    doc_control_status: string;
  };
  control: { primary: string; cross_walks: string[] };
  legend: Record<CellDisposition, SodLegendEntry>;
  roles: Array<{
    id: string;
    code: string;
    name: string;
    summary: string;
    ad_group: string;
    admin_tier: string;
    enforcement_mechanism: string;
  }>;
  matrix: Record<string, Record<string, CellDisposition>>;
  compensating_controls: Array<{ pair: [string, string]; label: string; controls: string[] }>;
  fail_open_sla: { P_cell_minutes: number; C_cell_minutes: number; rationale: string };
};

const SOD_MATRIX: SodMatrix = {
  source: {
    documentNumber: raw.source.document_number,
    documentName: raw.source.document_name,
    version: raw.source.version,
    releasedAt: raw.source.released_at,
    sha256: raw.source.sha256,
    docControlStatus: raw.source.doc_control_status,
  },
  primaryControl: raw.control.primary,
  crossWalks: raw.control.cross_walks,
  legend: raw.legend,
  roles: raw.roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    summary: r.summary,
    adGroup: r.ad_group,
    adminTier: r.admin_tier,
    enforcementMechanism: r.enforcement_mechanism,
  })),
  matrix: raw.matrix,
  compensatingControls: raw.compensating_controls,
  failOpenSla: {
    pMinutes: raw.fail_open_sla.P_cell_minutes,
    cMinutes: raw.fail_open_sla.C_cell_minutes,
    rationale: raw.fail_open_sla.rationale,
  },
};

export function getSodMatrix(): SodMatrix {
  return SOD_MATRIX;
}

export function getSodRole(id: string): SodRole | undefined {
  return SOD_MATRIX.roles.find((r) => r.id === id);
}

/**
 * Returns the disposition (P/C/A) for an ordered pair of roles. Returns
 * `null` for the diagonal (same role) since a role can't conflict with
 * itself.
 */
export function getCellDisposition(roleA: string, roleB: string): CellDisposition | null {
  if (roleA === roleB) return null;
  return SOD_MATRIX.matrix[roleA]?.[roleB] ?? null;
}

/**
 * Returns the compensating-control catalog entry for a C-pair, or null if
 * the pair isn't a C-cell or no catalog entry exists. Order-independent:
 * looks for both [a,b] and [b,a].
 */
export function getCompensatingControlsFor(
  roleA: string,
  roleB: string,
): SodCompensatingControl | null {
  return (
    SOD_MATRIX.compensatingControls.find(
      (cc) =>
        (cc.pair[0] === roleA && cc.pair[1] === roleB) ||
        (cc.pair[0] === roleB && cc.pair[1] === roleA),
    ) ?? null
  );
}

/**
 * Given a set of role IDs (an identity's full role set), return the
 * Prohibited pairs and the Compensating pairs present. Drives the
 * preventive provisioning check and the detective scan.
 */
export function findConflicts(roleIds: string[]): {
  prohibited: Array<{ a: string; b: string }>;
  compensating: Array<{ a: string; b: string }>;
} {
  const out = {
    prohibited: [] as Array<{ a: string; b: string }>,
    compensating: [] as Array<{ a: string; b: string }>,
  };
  for (let i = 0; i < roleIds.length; i += 1) {
    for (let j = i + 1; j < roleIds.length; j += 1) {
      const disp = getCellDisposition(roleIds[i], roleIds[j]);
      if (disp === "P") out.prohibited.push({ a: roleIds[i], b: roleIds[j] });
      else if (disp === "C") out.compensating.push({ a: roleIds[i], b: roleIds[j] });
    }
  }
  return out;
}

/**
 * Map an AD group name (e.g. "MAC-Vault-SysAdmins") to a role id (R1).
 * Returns null if the group isn't known. Drives the detective scan.
 */
export function getRoleByAdGroup(adGroup: string): SodRole | undefined {
  return SOD_MATRIX.roles.find((r) => r.adGroup === adGroup);
}
