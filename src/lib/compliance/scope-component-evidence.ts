/**
 * Maps boundary scope_components (capability categories) to NIST 800-171 / CMMC control families
 * for which evidence is expected. Used by the Evidence Engine to adjust evidence expectations.
 * Does not duplicate control→register logic; evidence map and assessment logic remain authoritative.
 */

/** NIST 800-171 control family codes present in the evidence map (e.g. AU, SI, SC, MA). */
export type EvidenceFamily = "AU" | "SI" | "SC" | "MA";

/**
 * Scope component → control families for which evidence is required when this component is in scope.
 * - siem_logging → AU (Audit), SI (System and Information Integrity)
 * - endpoint_detection_response → SI
 * - backup_recovery → MA (Maintenance; 800-171 does not have CP, MA covers maintenance/backup-related evidence)
 * - key_management → SC (System and Communications Protection, crypto)
 */
const SCOPE_COMPONENT_TO_FAMILIES: Record<string, EvidenceFamily[]> = {
  siem_logging: ["AU", "SI"],
  endpoint_detection_response: ["SI"],
  backup_recovery: ["MA"],
  key_management: ["SC"],
};

/**
 * Returns the set of control families for which evidence is expected given the boundary's scope_components.
 * When a component is present (e.g. siem_logging), the corresponding families (AU, SI) are expected.
 * Returns empty set when scopeComponents is null or empty (no scope-based family filter).
 */
export function getEvidenceFamiliesForScopeComponents(
  scopeComponents: string[] | null
): Set<EvidenceFamily> {
  const set = new Set<EvidenceFamily>();
  if (!Array.isArray(scopeComponents) || scopeComponents.length === 0) return set;
  for (const scope of scopeComponents) {
    const families = SCOPE_COMPONENT_TO_FAMILIES[scope];
    if (families) {
      for (const f of families) set.add(f);
    }
  }
  return set;
}
