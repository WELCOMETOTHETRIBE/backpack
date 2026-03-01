/**
 * Seed Governance Portal: governance_control_metadata (18 pure + 17 hybrid),
 * governance_registers (16 register definitions as org-null templates).
 * Run: npx tsx src/scripts/seed-governance.ts
 */
import { db } from "../db";
import { governanceControlMetadata, governanceRegisters } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  GOVERNANCE_CONTROL_METADATA_SEED,
  REGISTER_DEFINITIONS,
} from "../lib/governance/seed-data";

async function seedGovernance() {
  console.log("Seeding governance_control_metadata...");
  for (const row of GOVERNANCE_CONTROL_METADATA_SEED) {
    const [existing] = await db
      .select()
      .from(governanceControlMetadata)
      .where(eq(governanceControlMetadata.controlId, row.controlId));
    if (existing) {
      console.log("  Skip (exists):", row.controlId);
      continue;
    }
    await db.insert(governanceControlMetadata).values({
      controlId: row.controlId,
      classification: row.classification,
      controlStatement: row.controlStatement,
      requiredDocuments: row.requiredDocuments,
      requiredRegisters: row.requiredRegisters,
      requiredHybridEvidenceTypes: row.requiredHybridEvidenceTypes,
    });
    console.log("  Inserted:", row.controlId, row.classification);
  }

  console.log("Seeding governance_registers (template, org-null)...");
  for (const def of REGISTER_DEFINITIONS) {
    const [existing] = await db
      .select()
      .from(governanceRegisters)
      .where(eq(governanceRegisters.registerKey, def.registerKey));
    if (existing) {
      console.log("  Skip (exists):", def.registerKey);
      continue;
    }
    await db.insert(governanceRegisters).values({
      organizationId: null,
      projectId: null,
      registerKey: def.registerKey,
      name: def.name,
      description: def.description ?? null,
      requiredColumns: def.requiredColumns,
      retainForDays: def.retainForDays ?? null,
    });
    console.log("  Inserted:", def.registerKey);
  }

  console.log("Governance seed done.");
}

seedGovernance().catch((err) => {
  console.error(err);
  process.exit(1);
});
