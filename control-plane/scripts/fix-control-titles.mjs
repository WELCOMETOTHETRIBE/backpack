#!/usr/bin/env node
// One-off data fix: replace corrupted control titles + nistExactText in the DB
// using the canonical sctm-control-summaries.json. The PDF importer bled page
// headers ("CMMC Assessment Guide – Level 2 | Version 2.13 NNN") and mid-
// sentence fragments into several rows. The sctm JSON is the source of truth
// used elsewhere in the UI, so we align the controls table to it.
//
// Usage:  DATABASE_URL=postgresql://... node scripts/fix-control-titles.mjs
//         DATABASE_URL=postgresql://... node scripts/fix-control-titles.mjs --dry

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

const summariesPath = path.join(ROOT, "src/data/cmmc/sctm-control-summaries.json");
const summaries = JSON.parse(fs.readFileSync(summariesPath, "utf-8"));

console.log(`Loaded ${Object.keys(summaries).length} control summaries from sctm-control-summaries.json`);
console.log(DRY ? "MODE: dry-run (no writes)" : "MODE: live update");

const sql = postgres(DATABASE_URL, { prepare: false });

const before = await sql`SELECT control_id, title, nist_exact_text FROM controls ORDER BY control_id`;
console.log(`Found ${before.length} controls in DB`);

let updated = 0;
let skipped = 0;

for (const [controlId, s] of Object.entries(summaries)) {
  const row = before.find((r) => r.control_id === controlId);
  if (!row) {
    skipped++;
    continue;
  }

  const newTitle = s.title;
  const newRequirement = s.requirement;

  const titleChanged = row.title !== newTitle;
  const reqChanged = row.nist_exact_text !== newRequirement;

  if (!titleChanged && !reqChanged) continue;

  if (DRY) {
    console.log(`[${controlId}]`);
    if (titleChanged) {
      console.log(`  title:    "${(row.title ?? "").slice(0, 60)}" → "${newTitle.slice(0, 60)}"`);
    }
    if (reqChanged) {
      console.log(`  nist_txt: "${(row.nist_exact_text ?? "").slice(0, 60)}" → "${newRequirement.slice(0, 60)}"`);
    }
  } else {
    await sql`
      UPDATE controls
         SET title = ${newTitle},
             nist_exact_text = ${newRequirement}
       WHERE control_id = ${controlId}
    `;
  }
  updated++;
}

console.log(`\n${DRY ? "Would update" : "Updated"}: ${updated} / ${before.length}`);
console.log(`Skipped (missing from JSON): ${skipped}`);
await sql.end();
