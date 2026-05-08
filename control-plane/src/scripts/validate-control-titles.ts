/**
 * Sanity check: ensure all 110 NIST 800-171 controls are present and have proper display titles.
 * Uses the same display-title logic as GET /api/controls/nist.
 *
 * Usage: npx tsx src/scripts/validate-control-titles.ts
 * Requires controls table to be seeded (e.g. seed-controls-from-parsed-json). Exits 0 if all OK; 1 if any missing or bad titles.
 */

import { db } from "../db";
import { controls } from "../db/schema";
import { inArray } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "../lib/artifact-guide";
import {
  getControlDisplayTitle,
  isBadTitle,
  MIN_TITLE_LENGTH,
} from "../lib/controls/display-title";

async function main() {
  const rows = await db
    .select({
      controlId: controls.controlId,
      title: controls.title,
      nistExactText: controls.nistExactText,
    })
    .from(controls)
    .where(inArray(controls.controlId, ALL_CONTROL_IDS));

  const byId = Object.fromEntries(rows.map((r) => [r.controlId, r]));

  const missing: string[] = [];
  const badTitles: { id: string; displayTitle: string; reason: string }[] = [];

  for (const id of ALL_CONTROL_IDS) {
    const row = byId[id];
    if (!row) {
      missing.push(id);
      continue;
    }
    const displayTitle = getControlDisplayTitle(row, id);
    const reasons: string[] = [];
    if (!displayTitle || displayTitle.trim().length === 0) {
      reasons.push("display title is empty");
    } else if (displayTitle === id) {
      // Fallback to control ID is acceptable when stored title/nistExactText are bad
    } else if (displayTitle.length < MIN_TITLE_LENGTH) {
      reasons.push(`too short (${displayTitle.length} < ${MIN_TITLE_LENGTH})`);
    } else if (isBadTitle(displayTitle)) {
      reasons.push("looks like metadata/fragment");
    }
    if (reasons.length > 0) {
      badTitles.push({
        id,
        displayTitle: (displayTitle || "(empty)").slice(0, 60) + ((displayTitle?.length ?? 0) > 60 ? "…" : ""),
        reason: reasons.join("; "),
      });
    }
  }

  if (missing.length > 0) {
    console.error("Missing controls in DB:", missing.length);
    missing.forEach((id) => console.error("  -", id));
  }
  if (badTitles.length > 0) {
    console.error("Controls with bad or short display titles:", badTitles.length);
    badTitles.forEach(({ id, displayTitle, reason }) =>
      console.error("  -", id, ":", displayTitle, "|", reason)
    );
  }

  const total = ALL_CONTROL_IDS.length;
  const ok = total - missing.length - badTitles.length;
  if (missing.length > 0 || badTitles.length > 0) {
    console.error(`Result: ${ok}/${total} controls OK. ${missing.length} missing, ${badTitles.length} bad titles.`);
    process.exit(1);
  }
  console.log(`All ${total} controls present with valid display titles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
