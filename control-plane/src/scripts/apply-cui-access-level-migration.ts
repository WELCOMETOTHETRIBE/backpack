/**
 * Apply migration 0064 (users.cui_access_level) — same hand-written-SQL
 * pattern as the other apply-*-migration scripts in this codebase, since
 * the drizzle journal has been corrupt since a prior sprint.
 *
 * Statements mirror drizzle/0064_users_cui_access_level.sql verbatim.
 * Keep them in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-cui-access-level-migration.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  {
    label: "0064 cui_access_level enum type",
    sql: `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cui_access_level') THEN
          CREATE TYPE cui_access_level AS ENUM ('general', 'privileged');
        END IF;
      END $$`,
  },
  {
    label: "0064 users.cui_access_level column",
    sql: `ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "cui_access_level" cui_access_level NOT NULL DEFAULT 'general'`,
  },
];

async function run() {
  let applied = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      applied++;
      console.log(`[cui-access-level-migration] applied: ${stmt.label}`);
    } catch (err) {
      console.error(
        `[cui-access-level-migration] FAILED: ${stmt.label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
  console.log(`[cui-access-level-migration] complete (${applied}/${STMTS.length})`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
