/**
 * One-off: fix control titles in the DB that have run-on or truncated text
 * (e.g. "name identifier, meant to be used for quick reference only; and finally followed by the").
 *
 * Usage: npx tsx src/scripts/fix-control-titles.ts
 *
 * - If nist_exact_text is present, re-derives title from it.
 * - Otherwise cleans the existing title (strip run-on phrases, truncate at word).
 */

import { db } from "../db";
import { controls } from "../db/schema";
import { eq } from "drizzle-orm";

const TITLE_MAX_LEN = 120;

function truncateAtWord(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen + 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.slice(0, lastSpace).trim();
  return cut.slice(0, maxLen).trim();
}

function deriveTitleFromRequirement(requirementText: string): string {
  const firstLine = requirementText.split("\n")[0].trim();
  if (!firstLine) {
    const fallback = requirementText.trim().slice(0, TITLE_MAX_LEN);
    return truncateAtWord(fallback, TITLE_MAX_LEN);
  }
  let title = firstLine
    .split(/[.;](?=\s|$)/)[0]
    .trim();
  if (!title) title = firstLine;
  const runOnMarkers = [
    /\s+and\s+finally\s+/i,
    /\s+;?\s*and\s+finally\s+/i,
    /,\s*meant to be used for quick reference only[^.]*$/i,
  ];
  for (const re of runOnMarkers) {
    const idx = title.search(re);
    if (idx > 10) title = title.slice(0, idx).trim();
  }
  return truncateAtWord(title, TITLE_MAX_LEN);
}

function cleanExistingTitle(title: string): string {
  let s = title
    .replace(/,?\s*meant to be used for quick reference only[^.]*$/i, "")
    .trim();
  s = s.replace(/\s*;?\s*and\s+finally\s+followed by[^.]*$/i, "").trim();
  return truncateAtWord(s || title, TITLE_MAX_LEN);
}

async function main() {
  const rows = await db
    .select({
      id: controls.id,
      controlId: controls.controlId,
      title: controls.title,
      nistExactText: controls.nistExactText,
    })
    .from(controls);

  let updated = 0;
  for (const row of rows) {
    const current = row.title ?? "";
    let newTitle: string;
    if (row.nistExactText && row.nistExactText.trim().length > 0) {
      newTitle = deriveTitleFromRequirement(row.nistExactText);
    } else {
      newTitle = cleanExistingTitle(current);
    }
    if (newTitle && newTitle !== current) {
      await db
        .update(controls)
        .set({ title: newTitle })
        .where(eq(controls.id, row.id));
      updated++;
      console.log(row.controlId, ":", current.slice(0, 60) + (current.length > 60 ? "…" : ""), "→", newTitle.slice(0, 60) + (newTitle.length > 60 ? "…" : ""));
    }
  }
  console.log("Done. Updated", updated, "of", rows.length, "controls.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
