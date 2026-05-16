/**
 * Preventive SoD check — pure logic.
 *
 * Phase 3C of AC.L2-3.1.4. Given (principal, target_group,
 * existing_groups, attested_principals), decides whether the proposed
 * group addition is allowed, allowed with attestation, or denied, by
 * walking the matrix in MAC-SOP-235 / sod_matrix.v1.json.
 *
 * No DB or auth here — callers persist the result into
 * sod_provisioning_decisions. That separation makes the decision
 * trivially unit-testable and means the same function backs both the
 * API endpoint and any future CLI tool.
 */
import {
  getRoleByAdGroup,
  getCellDisposition,
} from "@/lib/compliance/sod-matrix";

export type Decision = "allow" | "allow_with_attestation" | "deny";

export interface DecisionInput {
  /** Identity the addition is proposed for (UPN / sAMAccountName / DN). */
  principal: string;
  /** AD/Entra group the addition targets (e.g. "MAC-Vault-SecAdmins"). */
  targetGroup: string;
  /** Current group memberships the caller observed for `principal`. */
  existingGroups: string[];
  /**
   * Principals currently covered by a fresh quarterly attestation. If
   * present, C-cell pairs for them resolve to `allow` instead of
   * `allow_with_attestation`. (The /api/sod/scan endpoint uses the
   * same set.)
   */
  attestedPrincipals?: ReadonlySet<string>;
}

export interface DecisionResult {
  decision: Decision;
  /** R-id set if the addition were performed (current + new role). */
  resultingRoleIds: string[];
  /** Conflict pair driving the decision, when applicable. */
  conflictPair?: [string, string];
  /** Operational reason — surfaced in the API response and the UI. */
  reason: string;
}

function compareRoleIds(a: string, b: string): number {
  const na = parseInt(a.replace(/^R/i, ""), 10);
  const nb = parseInt(b.replace(/^R/i, ""), 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
  return na - nb;
}

function orderedPair(a: string, b: string): [string, string] {
  return compareRoleIds(a, b) <= 0 ? [a, b] : [b, a];
}

export function decidePreventive(input: DecisionInput): DecisionResult {
  const attested = input.attestedPrincipals ?? new Set<string>();

  // Resolve current roles from existingGroups; resolve target role from
  // targetGroup. Unknown groups are silently ignored (matches scan).
  const currentRoles: string[] = [];
  for (const g of input.existingGroups) {
    const r = getRoleByAdGroup(g);
    if (r && !currentRoles.includes(r.id)) currentRoles.push(r.id);
  }
  const targetRoleObj = getRoleByAdGroup(input.targetGroup);

  if (!targetRoleObj) {
    // Target group isn't in the matrix; matrix has nothing to say.
    // Allow with a clear reason — operator can still audit the action
    // via AD-side logs.
    return {
      decision: "allow",
      resultingRoleIds: [...currentRoles].sort(compareRoleIds),
      reason: `Target group '${input.targetGroup}' is not bound to an R-role in MAC-SOP-235. Matrix is silent; no SoD restriction applies.`,
    };
  }

  if (currentRoles.includes(targetRoleObj.id)) {
    // Already a member — no-op decision.
    return {
      decision: "allow",
      resultingRoleIds: [...currentRoles].sort(compareRoleIds),
      reason: `Principal already in ${targetRoleObj.id} (${targetRoleObj.code}); proposed addition is a no-op.`,
    };
  }

  const resulting = [...currentRoles, targetRoleObj.id];
  const sortedResulting = [...resulting].sort(compareRoleIds);

  // Walk every pair involving the NEW role to find the strongest violation.
  // (Existing-existing pairs aren't the concern of this addition; the
  // detective scan handles drift in prior state.)
  let worst: { type: "P" | "C"; pair: [string, string] } | null = null;
  for (const existing of currentRoles) {
    const disp = getCellDisposition(targetRoleObj.id, existing);
    if (disp === null || disp === "A") continue;
    const pair = orderedPair(targetRoleObj.id, existing);
    if (disp === "P") {
      // P always wins.
      worst = { type: "P", pair };
      break;
    }
    if (disp === "C" && (!worst || worst.type !== "P")) {
      worst = { type: "C", pair };
    }
  }

  if (!worst) {
    return {
      decision: "allow",
      resultingRoleIds: sortedResulting,
      reason: `No SoD conflict. Resulting role set is internally consistent per MAC-SOP-235.`,
    };
  }

  if (worst.type === "P") {
    return {
      decision: "deny",
      resultingRoleIds: sortedResulting,
      conflictPair: worst.pair,
      reason: `Prohibited combination ${worst.pair[0]} × ${worst.pair[1]} per MAC-SOP-235 §4. Provisioning denied.`,
    };
  }

  // C-cell: depends on attestation coverage.
  if (attested.has(input.principal)) {
    return {
      decision: "allow",
      resultingRoleIds: sortedResulting,
      conflictPair: worst.pair,
      reason: `Compensating-cell ${worst.pair[0]} × ${worst.pair[1]} is covered by the principal's current quarterly attestation.`,
    };
  }

  return {
    decision: "allow_with_attestation",
    resultingRoleIds: sortedResulting,
    conflictPair: worst.pair,
    reason: `Compensating-cell ${worst.pair[0]} × ${worst.pair[1]} per MAC-SOP-235 §4 + §6. Provisioning permitted only with a current quarterly attestation covering this identity. Open one in SCTM 3.1.4 → Attestation tab.`,
  };
}
