import { sprsScoringData, SprsControlScore } from './sprs_scoring_data';

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
 * @returns The calculated SPRS score, ranging from -203 to 110.
 */
export function calculateSprsScore(implementations: ControlImplementation[]): number {
  const STARTING_SCORE = 110;
  let totalDeductions = 0;

  const implementedControlIds = new Set(
    implementations.filter(c => c.isImplemented).map(c => c.controlId)
  );

  for (const control of sprsScoringData) {
    if (!implementedControlIds.has(control.id)) {
      totalDeductions += control.value;
    }
  }

  return STARTING_SCORE - totalDeductions;
}

/**
 * Example Usage:
 */

// Example 1: All controls implemented
const allImplemented: ControlImplementation[] = sprsScoringData.map(c => ({ controlId: c.id, isImplemented: true }));
const perfectScore = calculateSprsScore(allImplemented);
console.log(`Perfect Score (all implemented): ${perfectScore}`); // Expected: 110

// Example 2: No controls implemented
const noneImplemented: ControlImplementation[] = sprsScoringData.map(c => ({ controlId: c.id, isImplemented: false }));
const worstScore = calculateSprsScore(noneImplemented);
console.log(`Worst Score (none implemented): ${worstScore}`); // Expected: -196 (based on this data)

// Example 3: A mixed bag
const someImplemented: ControlImplementation[] = [
  { controlId: '3.1.1', isImplemented: true },
  { controlId: '3.1.3', isImplemented: false }, // -5 points
  { controlId: '3.5.3', isImplemented: false }, // -5 points
  { controlId: '3.13.11', isImplemented: false }, // -5 points
];
const partialScore = calculateSprsScore(someImplemented);
console.log(`Partial Score (some implemented): ${partialScore}`); // Expected: 110 - 15 = 95 (will be lower as other controls are not implemented)
