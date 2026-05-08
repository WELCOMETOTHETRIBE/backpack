/**
 * Seed Evidence Engine: upsert 23 registers from cmmc_l2_register_evidence_map and
 * register_entry_schemas into governance_registers (org-null templates).
 * Run: npx tsx src/scripts/seed-evidence-engine.ts
 */
import { db } from "../db";
import { governanceRegisters } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getEvidenceMap } from "../data/cmmc/evidence-map";
import { getRegisterSchemaByRegisterId } from "../data/cmmc/register-schemas";

async function seedEvidenceEngine() {
  const evidenceMap = getEvidenceMap();
  const registers = evidenceMap.registers;

  console.log("Seeding Evidence Engine registers (templates, org-null)...");
  for (const reg of registers) {
    const schema = getRegisterSchemaByRegisterId(reg.id);
    const defaultCadenceDays = schema?.default_cadence_days ?? null;

    const [existing] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          sql`${governanceRegisters.organizationId} IS NULL`,
          eq(governanceRegisters.registerKey, reg.id)
        )
      );

    if (existing) {
      await db
        .update(governanceRegisters)
        .set({
          name: reg.name,
          defaultCadenceDays,
          updatedAt: new Date(),
        })
        .where(eq(governanceRegisters.id, existing.id));
      console.log("  Updated:", reg.id);
    } else {
      await db.insert(governanceRegisters).values({
        organizationId: null,
        projectId: null,
        registerKey: reg.id,
        name: reg.name,
        description: reg.cadence_hint || null,
        requiredColumns: [],
        retainForDays: null,
        defaultCadenceDays,
      });
      console.log("  Inserted:", reg.id);
    }
  }

  console.log("Evidence Engine seed done.");
}

seedEvidenceEngine().catch((err) => {
  console.error(err);
  process.exit(1);
});
