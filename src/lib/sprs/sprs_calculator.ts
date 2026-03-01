import { sprsScoringData } from "./sprs_scoring_data";

/** Maximum SPRS score (all 110 controls implemented). NIST SP 800-171 DoD Assessment Methodology. */
export const SPRS_MAX = 110;

/** Minimum SPRS score (no controls implemented). Sum of all deduction values (1, 3, 5) = 313. */
export const SPRS_MIN =
  SPRS_MAX -
  sprsScoringData.reduce((sum, c) => sum + c.value, 0);

/** Width of the SPRS score range for progress calculation. */
export const SPRS_RANGE = SPRS_MAX - SPRS_MIN;

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
 * @returns The calculated SPRS score, ranging from SPRS_MIN to SPRS_MAX (e.g. -203 to 110).
 */
export function calculateSprsScore(
  implementations: ControlImplementation[],
  controlDeductionOverrides?: Record<string, number>
): number {
  const STARTING_SCORE = SPRS_MAX;
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
