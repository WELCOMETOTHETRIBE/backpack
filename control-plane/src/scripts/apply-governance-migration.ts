/**
 * One-off script to apply the governance migration (0014) to a database that
 * already has the schema from earlier migrations but was not created via
 * drizzle-kit migrate (e.g. db:push or manual). Run with production DATABASE_URL:
 *
 *   DATABASE_URL='postgresql://...' npx tsx src/scripts/apply-governance-migration.ts
 *
 * Safe to run multiple times: skips statements that fail with "already exists".
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const migrationPath = join(process.cwd(), "drizzle", "0014_eager_green_goblin.sql");
const content = readFileSync(migrationPath, "utf-8");

// Split by statement breakpoint; each chunk is one SQL statement (may span lines)
const statements = content
  .split(/--> statement-breakpoint\n/)
  .map((s) => s.trim())
  .filter(Boolean);

let applied = 0;
let skipped = 0;

for (const statement of statements) {
  if (!statement) continue;
  try {
    await sql.unsafe(statement);
    applied++;
    console.log("OK:", statement.slice(0, 60).replace(/\n/g, " ") + "...");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("already exists") ||
      msg.includes("duplicate key") ||
      msg.includes("42P07") ||
      msg.includes("42P16")
    ) {
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
console.log(`Done. Applied: ${applied}, Skipped: ${skipped}`);
