/**
 * Upserts the controls table from a JSON file produced by parse-controls-from-guide.ts.
 * Use after parsing the Assessment Guide PDF or NIST txt to populate NIST title/requirement/discussion.
 *
 * Usage:
 *   npx tsx src/scripts/seed-controls-from-parsed-json.ts docs/control-mapping-parsed.json
 *   npx tsx src/scripts/seed-controls-from-parsed-json.ts control-mapping-CUI-Evidence-20260224-082350.json
 */

import { db } from "../db";
import { controlFamilies, controls } from "../db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { CONTROL_FAMILIES } from "../components/governance-wizard/constants";

const PREFIX_TO_CODE: Record<string, string> = Object.fromEntries(
  CONTROL_FAMILIES.map((f) => [f.controlPrefix, f.code])
);

function familyCodeFromControlId(controlId: string): string {
  const prefix = controlId.split(".").slice(0, 2).join(".");
  return PREFIX_TO_CODE[prefix] ?? "AC";
}

type ParsedControl = {
  controlId: string;
  title: string;
  nistExactText: string;
  nistDiscussionGuidance: string | null;
};

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("Usage: npx tsx src/scripts/seed-controls-from-parsed-json.ts <path-to-parsed.json>");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), jsonPath);
  if (!fs.existsSync(resolved)) {
    console.error("File not found:", resolved);
    process.exit(1);
  }

  const list = JSON.parse(fs.readFileSync(resolved, "utf-8")) as ParsedControl[];
  if (!Array.isArray(list)) {
    console.error("JSON must be an array of { controlId, title, nistExactText, nistDiscussionGuidance }");
    process.exit(1);
  }

  console.log("Loading control families...");
  const familyRows = await db.select().from(controlFamilies);
  const codeToId: Record<string, string> = {};
  for (const row of familyRows) {
    codeToId[row.code] = row.id;
  }

  // Ensure all needed family codes exist (create if missing)
  for (const code of Object.values(PREFIX_TO_CODE)) {
    if (codeToId[code]) continue;
    const fam = CONTROL_FAMILIES.find((f) => f.code === code);
    if (!fam) continue;
    const [inserted] = await db
      .insert(controlFamilies)
      .values({ code, name: fam.name, description: `NIST SP 800-171 Rev 2 - ${fam.name}` })
      .returning({ id: controlFamilies.id });
    if (inserted) codeToId[code] = inserted.id;
  }

  let updated = 0;
  let inserted = 0;

  for (const c of list) {
    const familyCode = familyCodeFromControlId(c.controlId);
    const controlFamilyId = codeToId[familyCode];
    if (!controlFamilyId) {
      console.warn("Unknown family for", c.controlId, "- skipping");
      continue;
    }

    const [existing] = await db.select().from(controls).where(eq(controls.controlId, c.controlId));

    if (existing) {
      await db
        .update(controls)
        .set({
          title: c.title,
          nistExactText: c.nistExactText || null,
          nistDiscussionGuidance: c.nistDiscussionGuidance ?? null,
        })
        .where(eq(controls.id, existing.id));
      updated++;
    } else {
      await db.insert(controls).values({
        controlFamilyId,
        controlId: c.controlId,
        nistReqId: c.controlId,
        title: c.title,
        nistExactText: c.nistExactText || null,
        nistDiscussionGuidance: c.nistDiscussionGuidance ?? null,
      });
      inserted++;
    }
  }

  console.log("Done. Inserted:", inserted, "Updated:", updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
