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
  `DO $$ BEGIN ALTER TYPE "public"."register_entry_status" ADD VALUE 'void'; EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "default_cadence_days" integer`,
  `ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "cadence_override_days" integer`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "entry_type" varchar(80)`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "status" "register_entry_status" DEFAULT 'draft' NOT NULL`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid REFERENCES "public"."users"("id")`,
  `DO $$ BEGIN ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "locked_by_id" uuid REFERENCES "public"."users"("id")`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "voided_by_id" uuid REFERENCES "public"."users"("id")`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "void_reason" text`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "exportable" boolean DEFAULT false`,
  `ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "uploaded_by_id" uuid REFERENCES "public"."users"("id")`,
  `ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp with time zone DEFAULT now()`,
  `ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "exportable" boolean DEFAULT false`,
  // 0030: boundary_id on Evidence Engine tables (must run in order; backfill before NOT NULL)
  `ALTER TABLE "boundary" ADD COLUMN IF NOT EXISTS "boundary_type" varchar(32) NOT NULL DEFAULT 'cui_enclave'`,
  `UPDATE "boundary" SET "boundary_type" = 'cui_enclave' WHERE "boundary_type" IS NULL OR "boundary_type" = ''`,
  `CREATE INDEX IF NOT EXISTS "boundary_org_type_idx" ON "boundary" ("organization_id", "boundary_type")`,
  `ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "boundary_id" uuid`,
  `UPDATE "governance_register_entries" e SET "boundary_id" = (SELECT b.id FROM "boundary" b INNER JOIN "governance_registers" r ON r.organization_id = b.organization_id WHERE r.id = e.register_id ORDER BY b.created_at LIMIT 1) WHERE e."boundary_id" IS NULL`,
  `ALTER TABLE "governance_register_entries" ALTER COLUMN "boundary_id" SET NOT NULL`,
  `DO $$ BEGIN ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "gov_register_entries_boundary_register_idx" ON "governance_register_entries" ("boundary_id", "register_id")`,
  `ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "boundary_id" uuid`,
  `UPDATE "governance_register_entry_files" f SET "boundary_id" = e.boundary_id FROM "governance_register_entries" e WHERE f.register_entry_id = e.id AND f."boundary_id" IS NULL`,
  `ALTER TABLE "governance_register_entry_files" ALTER COLUMN "boundary_id" SET NOT NULL`,
  `DO $$ BEGIN ALTER TABLE "governance_register_entry_files" ADD CONSTRAINT "governance_register_entry_files_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "gov_entry_files_boundary_entry_idx" ON "governance_register_entry_files" ("boundary_id", "register_entry_id")`,
  // 0028: create governance_entry_events if missing (no boundary_id yet)
  `CREATE TABLE IF NOT EXISTS "governance_entry_events" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE, "entry_id" uuid NOT NULL REFERENCES "public"."governance_register_entries"("id") ON DELETE CASCADE, "actor_user_id" uuid REFERENCES "public"."users"("id"), "event_type" text NOT NULL, "event_at" timestamp with time zone DEFAULT now() NOT NULL, "event_json" jsonb)`,
  `CREATE INDEX IF NOT EXISTS "governance_entry_events_org_id_idx" ON "governance_entry_events" ("org_id")`,
  `CREATE INDEX IF NOT EXISTS "governance_entry_events_entry_id_idx" ON "governance_entry_events" ("entry_id")`,
  // 0030: boundary_id on governance_entry_events
  `ALTER TABLE "governance_entry_events" ADD COLUMN IF NOT EXISTS "boundary_id" uuid`,
  `UPDATE "governance_entry_events" ev SET "boundary_id" = e.boundary_id FROM "governance_register_entries" e WHERE ev.entry_id = e.id AND ev."boundary_id" IS NULL`,
  `ALTER TABLE "governance_entry_events" ALTER COLUMN "boundary_id" SET NOT NULL`,
  `DO $$ BEGIN ALTER TABLE "governance_entry_events" ADD CONSTRAINT "governance_entry_events_boundary_id_boundary_id_fk" FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE CASCADE ON UPDATE NO ACTION; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "gov_entry_events_org_boundary_entry_idx" ON "governance_entry_events" ("org_id", "boundary_id", "entry_id")`,
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
