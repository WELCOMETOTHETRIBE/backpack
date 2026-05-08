/**
 * Seed control responsibilities from control_responsibility_templates.v1.json.
 * Upserts one row per control per org (boundary_id = null). Idempotent.
 * Requires ORG_ID env (Admin/approver intent: run only for intended org).
 * Run: ORG_ID=<uuid> npx tsx src/scripts/seed-control-responsibilities.ts
 */
import { db } from "../db";
import { governanceControlResponsibilities } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getControlResponsibilityTemplates } from "../data/cmmc/control-responsibility-templates";

async function seedControlResponsibilities() {
  const orgId = process.env.ORG_ID;
  if (!orgId) {
    console.error("ORG_ID env is required. Example: ORG_ID=<uuid> npm run seed-control-responsibilities");
    process.exit(1);
  }

  const templates = getControlResponsibilityTemplates();
  console.log(`Seeding control responsibilities for org ${orgId} (${templates.controls.length} controls)...`);

  for (const c of templates.controls) {
    const [existing] = await db
      .select()
      .from(governanceControlResponsibilities)
      .where(
        and(
          eq(governanceControlResponsibilities.orgId, orgId),
          sql`${governanceControlResponsibilities.boundaryId} IS NULL`,
          eq(governanceControlResponsibilities.controlId, c.control_id)
        )
      );

    const values = {
      responsibilityModel: c.responsibility_model,
      azureInheritedJson: c.azure_inherited ?? [],
      mactechProvidedJson: c.mactech_provided ?? [],
      customerRequiredJson: c.customer_required ?? [],
      notesJson: c.notes ?? [],
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(governanceControlResponsibilities)
        .set(values)
        .where(eq(governanceControlResponsibilities.id, existing.id));
    } else {
      await db.insert(governanceControlResponsibilities).values({
        orgId,
        boundaryId: null,
        controlId: c.control_id,
        ...values,
      });
    }
  }

  console.log("Control responsibilities seed done.");
}

seedControlResponsibilities().catch((err) => {
  console.error(err);
  process.exit(1);
});
