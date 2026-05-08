#!/usr/bin/env node
/**
 * Apply the re-parsed NIST 800-171 Rev 2 guidance to the controls table.
 *
 * Reads docs/control-mapping-parsed-clean.json (output of
 * scripts/parse-800-171-guide.py) and updates ONLY:
 *   - controls.nist_discussion_guidance ← full assessment guide blob
 *                                         (objectives + methods + discussion
 *                                          + further + examples + refs)
 *
 * Leaves controls.title and controls.nist_exact_text alone — already fixed
 * by fix-control-titles.mjs using sctm-control-summaries.json.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/apply-nist-guidance-fix.mjs --dry
 *   DATABASE_URL=postgresql://... node scripts/apply-nist-guidance-fix.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = process.env.DATABASE_URL;
const DRY = process.argv.includes("--dry");

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const parsedPath = path.join(ROOT, "docs/control-mapping-parsed-clean.json");
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

console.log(`Loaded ${Object.keys(parsed).length} controls from parsed JSON`);
console.log(DRY ? "MODE: dry-run (no writes)" : "MODE: live update");

const sql = postgres(DATABASE_URL, { prepare: false });

const before = await sql`
  SELECT control_id, left(nist_discussion_guidance, 80) AS discuss
  FROM controls ORDER BY control_id
`;
console.log(`Found ${before.length} controls in DB`);

let updated = 0;
let unchanged = 0;
let missing = 0;

for (const [controlId, v] of Object.entries(parsed)) {
  const existing = before.find((r) => r.control_id === controlId);
  if (!existing) {
    missing++;
    continue;
  }

  const newDiscuss = v.nist_discussion_guidance?.trim() ?? null;
  if (!newDiscuss) {
    console.log(`[${controlId}] SKIP — re-parse produced no guidance blob`);
    unchanged++;
    continue;
  }

  if (DRY) {
    console.log(`[${controlId}]`);
    console.log(`  discuss:  ${newDiscuss.slice(0, 100).replace(/\n/g, " ⏎ ")}`);
  } else {
    await sql`
      UPDATE controls
         SET nist_discussion_guidance = ${newDiscuss}
       WHERE control_id = ${controlId}
    `;
  }
  updated++;
}

console.log(`\n${DRY ? "Would update" : "Updated"}: ${updated}`);
console.log(`Unchanged (empty re-parse): ${unchanged}`);
console.log(`Missing from DB: ${missing}`);
await sql.end();
