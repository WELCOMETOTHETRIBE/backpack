/**
 * Recalculate control statuses for all controls linked to a register.
 * Called when register entries are finalized or voided, so that the
 * control status reflects live register satisfaction.
 */
import { db } from "@/db";
import { controlRecords, governanceRegisters } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateControlStatus } from "./control-status";

/**
 * Given a register ID and orgId, find all controls linked to that register
 * and recalculate their implementation status.
 */
export async function recalculateControlsForRegister(
  registerId: string,
  organizationId: string
): Promise<{ recalculated: number; controlIds: string[] }> {
  // Get the register to find its controlIds
  const [register] = await db
    .select({ controlIds: governanceRegisters.controlIds })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.id, registerId))
    .limit(1);

  if (!register) return { recalculated: 0, controlIds: [] };

  const controlIdsList = (register.controlIds ?? []) as string[];
  if (controlIdsList.length === 0) return { recalculated: 0, controlIds: [] };

  // Find control records for these control IDs
  const affectedRecords = await db
    .select({ id: controlRecords.id, controlId: controlRecords.controlId })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, organizationId),
      )
    );

  const toRecalculate = affectedRecords.filter((r) =>
    controlIdsList.includes(r.controlId)
  );

  const recalculated: string[] = [];
  for (const rec of toRecalculate) {
    await calculateControlStatus(rec.id);
    recalculated.push(rec.controlId);
  }

  return { recalculated: recalculated.length, controlIds: recalculated };
}
