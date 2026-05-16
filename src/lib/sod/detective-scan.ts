/**
 * SoD detective scan — pure logic.
 *
 * Phase 2A of AC.L2-3.1.4. The scan ingests a list of identities and the
 * AD/Entra groups they hold (as exported by a script running in the
 * customer enclave under R3's domain), maps each group to its R-role per
 * the matrix in MAC-SOP-235, and reports any conflict pairs.
 *
 * No DB or auth here — callers persist the result into sod_findings.
 * That separation makes the scan trivially unit-testable and lets the
 * same function back both the API endpoint and any future CLI tool.
 *
 * Pair normalization: every returned pair is `[a, b]` ordered by numeric
 * R-id so callers can dedupe via a single unique index. "R1" < "R2" <
 * "R10" (numeric, not lexical).
 */
import {
  getRoleByAdGroup,
  getCellDisposition,
  getSodMatrix,
  type CellDisposition,
} from "@/lib/compliance/sod-matrix";

export interface PrincipalGroupExport {
  /** Stable identifier for the identity (UPN, SID, sAMAccountName, etc.). */
  principal: string;
  /** AD/Entra group names the identity is a member of, as exported. */
  adGroups: string[];
}

export type FindingDispositionType = "P" | "C_no_attestation";
export type FindingSeverity = "high" | "medium";

export interface ScanFinding {
  principal: string;
  /** Full R-role set the identity holds at scan time. */
  roleIds: string[];
  /** Conflicting pair, sorted by numeric R-id. */
  pair: [string, string];
  dispositionType: FindingDispositionType;
  severity: FindingSeverity;
}

export interface ScanInput {
  principals: PrincipalGroupExport[];
  /**
   * Optional principal-id allowlist of identities whose Compensating
   * combinations are currently covered by a quarterly attestation. C-cell
   * pairs held by these identities are NOT flagged. In Phase 2A this is
   * empty (no attestation workflow yet); Phase 2C wires it.
   */
  attestedPrincipals?: ReadonlySet<string>;
}

export interface ScanResult {
  findings: ScanFinding[];
  /** Principals seen in input (for run-summary accounting). */
  principalsScanned: number;
  /** Total AD groups across all principals (for run-summary accounting). */
  groupsObserved: number;
}

/**
 * Sort two R-ids by numeric suffix: "R1" < "R2" < "R10". Lexical sort
 * would put "R10" between "R1" and "R2".
 */
function compareRoleIds(a: string, b: string): number {
  const na = parseInt(a.replace(/^R/i, ""), 10);
  const nb = parseInt(b.replace(/^R/i, ""), 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
  return na - nb;
}

function orderedPair(a: string, b: string): [string, string] {
  return compareRoleIds(a, b) <= 0 ? [a, b] : [b, a];
}

export function detectiveScan(input: ScanInput): ScanResult {
  const attested = input.attestedPrincipals ?? new Set<string>();
  const findings: ScanFinding[] = [];
  let groupsObserved = 0;

  for (const p of input.principals) {
    groupsObserved += p.adGroups.length;

    // Map AD groups → R-role ids. Unknown groups are silently dropped;
    // a future enhancement can surface them as a separate audit signal.
    const roleIds: string[] = [];
    for (const g of p.adGroups) {
      const role = getRoleByAdGroup(g);
      if (role && !roleIds.includes(role.id)) roleIds.push(role.id);
    }
    if (roleIds.length < 2) continue;

    // Walk every unique pair. Pair count is C(n,2) — small (n ≤ 10).
    for (let i = 0; i < roleIds.length; i += 1) {
      for (let j = i + 1; j < roleIds.length; j += 1) {
        const disp: CellDisposition | null = getCellDisposition(roleIds[i], roleIds[j]);
        if (disp === null) continue;
        if (disp === "A") continue;

        const pair = orderedPair(roleIds[i], roleIds[j]);

        if (disp === "P") {
          findings.push({
            principal: p.principal,
            roleIds: [...roleIds].sort(compareRoleIds),
            pair,
            dispositionType: "P",
            severity: "high",
          });
          continue;
        }

        // disp === "C"
        if (attested.has(p.principal)) continue;
        findings.push({
          principal: p.principal,
          roleIds: [...roleIds].sort(compareRoleIds),
          pair,
          dispositionType: "C_no_attestation",
          severity: "medium",
        });
      }
    }
  }

  return {
    findings,
    principalsScanned: input.principals.length,
    groupsObserved,
  };
}

/**
 * Sanity helper — returns the matrix version / source the scan ran
 * against. Callers stamp this on the scan-run record so historical
 * findings can be traced back to the matrix revision that flagged them.
 */
export function scanMatrixVersion(): { documentNumber: string; version: string; sha256: string | null } {
  const matrix = getSodMatrix();
  return {
    documentNumber: matrix.source.documentNumber,
    version: matrix.source.version,
    sha256: matrix.source.sha256,
  };
}
