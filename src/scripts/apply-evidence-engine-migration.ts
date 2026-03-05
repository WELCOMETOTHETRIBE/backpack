/**
 * Apply Evidence Engine schema changes (register_entry_status enum + new columns).
 * Use when db:migrate fails (e.g. due to other migrations) but you need Evidence Engine.
 * Run: DATABASE_URL='...' npx tsx src/scripts/apply-evidence-engine-migration.ts
 * Safe to run multiple times (IF NOT EXISTS / EXCEPTION WHEN duplicate_object).
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS = [
  `DO $$ BEGIN CREATE TYPE "public"."register_entry_status" AS ENUM('draft', 'final'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "default_cadence_days" integer`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "entry_type" varchar(80)`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "status" "register_entry_status" DEFAULT 'draft' NOT NULL`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid REFERENCES "public"."users"("id")`,
  `DO $$ BEGIN ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

async function main() {
  let applied = 0;
  let skipped = 0;
  for (const statement of STMTS) {
    try {
      await sql.unsafe(statement);
      applied++;
      console.log("OK:", statement.slice(0, 55).replace(/\n/g, " ") + "...");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("duplicate_object") || msg.includes("42P07") || msg.includes("42701")) {
        skipped++;
        console.log("Skip (already exists):", statement.slice(0, 50).replace(/\n/g, " ") + "...");
      } else {
        console.error("Failed:", statement.slice(0, 80));
        console.error(err);
        await sql.end();
        process.exit(1);
      }
    }
  }
  await sql.end();
  console.log(`Evidence Engine migration done. Applied: ${applied}, Skipped: ${skipped}`);
  process.exit(0);
}

main();
