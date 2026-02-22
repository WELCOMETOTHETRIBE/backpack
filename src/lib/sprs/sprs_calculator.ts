import { sprsScoringData } from "./sprs_scoring_data";

/**
 * Represents the implementation status of a single control.
 */
export interface ControlImplementation {
  controlId: string;
  isImplemented: boolean;
}

/**
 * Calculates the SPRS score for a given set of control implementations.
 *
 * @param implementations An array of control implementation statuses.
 * @param controlDeductionOverrides Optional map of controlId -> deduction value (e.g. 3.13.11: 3 for non-FIPS case).
 * @returns The calculated SPRS score, ranging from -203 to 110.
 */
export function calculateSprsScore(
  implementations: ControlImplementation[],
  controlDeductionOverrides?: Record<string, number>
): number {
  const STARTING_SCORE = 110;
  let totalDeductions = 0;

  const implementedControlIds = new Set(
    implementations.filter((c) => c.isImplemented).map((c) => c.controlId)
  );

  for (const control of sprsScoringData) {
    if (!implementedControlIds.has(control.id)) {
      const deduction =
        controlDeductionOverrides?.[control.id] ?? control.value;
      totalDeductions += deduction;
    }
  }

  return STARTING_SCORE - totalDeductions;
}
