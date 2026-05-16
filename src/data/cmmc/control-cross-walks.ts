/**
 * Control cross-walks — bidirectional control-to-control relationships
 * that an assessor walks when validating a control. Powers the chip row
 * in SCTM control detail (Phase 3B of AC.L2-3.1.4).
 *
 * Each entry names a pair of controls and the operational rationale for
 * the relationship in concise C3PAO language. Cross-walks are stored as
 * unordered pairs and exposed as bidirectional via the helper below.
 *
 * Keep this list small and defensible — every cross-walk surfaces a
 * navigation chip in the UI. Add a pair only when there's a real shared
 * evidence artifact or a shared enforcement mechanism that an assessor
 * would actually pivot to.
 */

export interface ControlCrossWalk {
  /** Unordered pair of control ids (NIST short form, e.g. "3.1.4"). */
  pair: [string, string];
  /** One-line rationale, surfaced as the chip tooltip. */
  rationale: string;
  /**
   * Optional short label override. When omitted, the chip shows the
   * target control id only.
   */
  label?: string;
}

/**
 * Cross-walks anchored to AC.L2-3.1.4 (Separation of Duties) and its
 * neighbors. Each is bidirectional — surfacing the same rationale
 * from either side.
 */
export const CONTROL_CROSS_WALKS: ControlCrossWalk[] = [
  {
    pair: ["3.1.4", "3.1.5"],
    rationale:
      "PIM eligible-vs-active separation (R1/R5/R10) supports both: 3.1.4 names the duty boundaries; 3.1.5 enforces minimum-necessary access on the way in.",
  },
  {
    pair: ["3.1.4", "3.3.1"],
    rationale:
      "R3's independent audit collector (WEF subscription) captures privileged-action events that satisfy 3.1.4 enforcement evidence and 3.3.1 auditable-events scope simultaneously.",
  },
  {
    pair: ["3.1.4", "3.4.1"],
    rationale:
      "R9 (Change Manager / CCB) approves changes that affect MAC-Vault-* group structure, PIM definitions, JEA endpoints, or WDAC policies — same approval chain anchors 3.4.1 baseline-configuration changes.",
  },
];

/**
 * Returns every cross-walk involving the given control id, with the
 * "other side" pre-computed for UI rendering.
 */
export function getCrossWalksFor(
  controlId: string,
): Array<{ targetControlId: string; rationale: string; label?: string }> {
  const out: Array<{ targetControlId: string; rationale: string; label?: string }> = [];
  for (const cw of CONTROL_CROSS_WALKS) {
    if (cw.pair[0] === controlId) {
      out.push({ targetControlId: cw.pair[1], rationale: cw.rationale, label: cw.label });
    } else if (cw.pair[1] === controlId) {
      out.push({ targetControlId: cw.pair[0], rationale: cw.rationale, label: cw.label });
    }
  }
  // Stable sort by target control id (numeric R-id-ish — 3.1.5 before 3.3.1).
  out.sort((a, b) => a.targetControlId.localeCompare(b.targetControlId, undefined, { numeric: true }));
  return out;
}
