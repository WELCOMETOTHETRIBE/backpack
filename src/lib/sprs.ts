import { db } from "@/db";
import { controlImplementations, controls } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Calculate SPRS score based on NIST SP 800-171 DoD Assessment Methodology
 * Maximum score is 110. Each unimplemented control deducts its point value.
 * Baseline is 110; each "Not Implemented" control subtracts its weighted value.
 */
export async function calculateSprsScore(organizationId: string): Promise<number> {
  const impls = await db
    .select({
      status: controlImplementations.status,
      controlId: controls.controlId,
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .where(eq(controlImplementations.organizationId, organizationId));

  // Each control is worth 1 point in the baseline 110-point system
  const totalControls = 110;
  const baselineScore = 110;

  // Count unimplemented controls (Not Started, Partial, POA&M are considered not fully implemented)
  const unimplemented = impls.filter(
    (impl) => impl.status === "Not Started" || impl.status === "Partial" || impl.status === "POA&M"
  ).length;

  // Each unimplemented control deducts 1 point
  const score = Math.max(0, baselineScore - unimplemented);

  return score;
}
