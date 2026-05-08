/**
 * Seeds the ir_scenarios catalog from src/data/ir-scenarios.v1.json.
 *
 * Idempotent: upserts on (code, version). Existing rows are updated in place;
 * new rows are inserted. To replace a scenario in the field, bump its version.
 *
 * Run: npm run seed-ir-scenarios
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { irScenarios, type IrScenarioInject } from "@/db/schema";
import seedData from "@/../src/data/ir-scenarios.v1.json";

type SeedScenario = {
  code: string;
  version: number;
  title: string;
  summary: string;
  narrative: string;
  targetedControlIds: string[];
  defaultRoe: string;
  injectsJson: IrScenarioInject[];
};

async function main() {
  const scenarios = (seedData as { scenarios: SeedScenario[] }).scenarios;
  if (!scenarios?.length) {
    console.error("No scenarios found in seed data");
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  for (const s of scenarios) {
    const result = await db
      .insert(irScenarios)
      .values({
        code: s.code,
        version: s.version,
        title: s.title,
        summary: s.summary,
        narrative: s.narrative,
        targetedControlIds: s.targetedControlIds,
        defaultRoe: s.defaultRoe,
        injectsJson: s.injectsJson,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [irScenarios.code, irScenarios.version],
        set: {
          title: s.title,
          summary: s.summary,
          narrative: s.narrative,
          targetedControlIds: s.targetedControlIds,
          defaultRoe: s.defaultRoe,
          injectsJson: s.injectsJson,
          isActive: true,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: irScenarios.id, code: irScenarios.code, version: irScenarios.version });

    const row = result[0];
    if (row) {
      // We can't reliably tell insert vs update without a count column;
      // log unconditionally and let the operator inspect.
      console.log(`upserted ${row.code} v${row.version} -> ${row.id}`);
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`\nSeed complete. Processed ${inserted} scenario(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
