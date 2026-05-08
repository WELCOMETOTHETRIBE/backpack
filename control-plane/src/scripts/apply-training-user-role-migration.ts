/**
 * Apply migration 0046 — training_records.user_role.
 *
 * Same pattern as apply-trainos-migrations.ts: the drizzle journal in
 * this codebase has been corrupt since a prior sprint, so
 * `drizzle-kit migrate` no-ops on hand-written SQL files. Re-emit 0046
 * as an idempotent ALTER and run on every deploy via `npm run release`.
 *
 * Statement mirrors drizzle/0046_training_user_role.sql verbatim. Keep
 * them in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-training-user-role-migration.ts
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
    label: "0046 training_records.user_role column",
    sql: `ALTER TABLE training_records ADD COLUMN IF NOT EXISTS user_role varchar(80)`,
  },
];

async function run() {
  let applied = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      applied++;
      console.log(`[training-user-role-migration] applied: ${stmt.label}`);
    } catch (err) {
      console.error(
        `[training-user-role-migration] FAILED: ${stmt.label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
  console.log(
    `[training-user-role-migration] complete (${applied}/${STMTS.length})`,
  );
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
