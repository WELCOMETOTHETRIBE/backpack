/**
 * Parses NIST SP 800-171 / CMMC control text (from Assessment Guide PDF or NIST txt)
 * into JSON objects for mapping to the controls table (title, nistExactText, nistDiscussionGuidance).
 *
 * Usage:
 *   npx tsx src/scripts/parse-controls-from-guide.ts <path-to-pdf-or-txt> [--output controls.json]
 *   npx tsx src/scripts/parse-controls-from-guide.ts "docs/AssessmentGuideL2v2 (1).pdf"
 *   npx tsx src/scripts/parse-controls-from-guide.ts docs/nist_800_171_r2.txt
 */

import * as fs from "fs";
import * as path from "path";
import { ALL_CONTROL_IDS } from "../lib/artifact-guide";

export type ParsedControl = {
  controlId: string;
  title: string;
  nistExactText: string;
  nistDiscussionGuidance: string | null;
};

/** Line is only control ID (e.g. "3.1.1") — NIST txt format. */
const CONTROL_ID_ONLY_REGEX = /^\s*(3\.\d+\.\d+)\s*$/;
/** Line contains control ID at start or in AC.L2-3.1.1 style — Assessment Guide PDF. */
const CONTROL_ID_IN_LINE_REGEX = /(?:^|\s)([A-Z]{2}\.L2-)?(3\.\d+\.\d+)(?:\s|$|–|\))/;

/**
 * Extract text from a PDF file using pdf-parse (PDFParse.getText).
 */
async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

/**
 * Parse raw text (from PDF or txt) into control blocks.
 * Supports: (1) NIST txt — line with only "3.x.x", then requirement, then "DISCUSSION";
 *           (2) Assessment Guide PDF — line with "AC.L2-3.1.1" or "3.1.1", then requirement, then "ASSESSMENT OBJECTIVES" or "DISCUSSION".
 */
export function parseControlBlocks(rawText: string): ParsedControl[] {
  const lines = rawText.split(/\r?\n/);
  const controlLineIndices: { index: number; controlId: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const onlyMatch = line.match(CONTROL_ID_ONLY_REGEX);
    if (onlyMatch) {
      controlLineIndices.push({ index: i, controlId: onlyMatch[1].trim() });
      continue;
    }
    const inlineMatch = line.match(CONTROL_ID_IN_LINE_REGEX);
    if (inlineMatch) {
      const controlId = inlineMatch[2];
      controlLineIndices.push({ index: i, controlId });
    }
  }

  const sorted = [...controlLineIndices].sort((a, b) => a.index - b.index);
  const nextIndex = (i: number) => sorted.find((c) => c.index > i)?.index ?? lines.length;

  // Deduplicate by controlId: keep block that has more requirement text (body vs TOC)
  const byId = new Map<string, { index: number; controlId: string }[]>();
  for (const entry of sorted) {
    const list = byId.get(entry.controlId) ?? [];
    list.push(entry);
    byId.set(entry.controlId, list);
  }
  const deduped: { index: number; controlId: string }[] = [];
  for (const [, list] of byId) {
    if (list.length === 1) {
      deduped.push(list[0]);
    } else {
      const withContent = list.map((e) => ({
        ...e,
        blockLen: lines.slice(e.index + 1, nextIndex(e.index)).join(" ").length,
      }));
      withContent.sort((a, b) => b.blockLen - a.blockLen);
      deduped.push(withContent[0]);
    }
  }
  deduped.sort((a, b) => a.index - b.index);

  const results: ParsedControl[] = [];

  for (let k = 0; k < deduped.length; k++) {
    const { index: start, controlId } = deduped[k];
    const nextEntry = deduped[k + 1];
    const end = nextEntry ? nextEntry.index : lines.length;
    const blockLines = lines.slice(start + 1, end);
    const blockText = blockLines.join("\n");

    const discussionIdx = blockLines.findIndex(
      (l) =>
        l.trim().toUpperCase() === "DISCUSSION" ||
        l.trim().toUpperCase().startsWith("ASSESSMENT OBJECTIVES")
    );
    let requirementText: string;
    let discussionText: string | null = null;

    if (discussionIdx >= 0) {
      requirementText = blockLines
        .slice(0, discussionIdx)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      discussionText = blockLines
        .slice(discussionIdx + 1)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      discussionText = cleanDiscussion(discussionText);
    } else {
      requirementText = blockText.replace(/\n{3,}/g, "\n\n").trim();
    }

    requirementText = cleanRequirement(requirementText);
    if (!requirementText) continue;
    if (!ALL_CONTROL_IDS.includes(controlId)) continue;
    if (/^\s*Appendix\s/i.test(requirementText) || /^\s*Introduction\s/i.test(requirementText)) continue;
    const title = deriveTitle(requirementText);

    results.push({
      controlId,
      title,
      nistExactText: requirementText,
      nistDiscussionGuidance: discussionText || null,
    });
  }

  const resultByControlId = new Map(results.map((r) => [r.controlId, r]));
  return ALL_CONTROL_IDS.map((id) => resultByControlId.get(id)).filter((r): r is ParsedControl => r != null);
}

function cleanRequirement(s: string): string {
  return s
    .replace(/^(CHAPTER THREE|PAGE \d+)\s*$/gim, "")
    .replace(/SP 800-171, REVISION 2[\s\S]*?________________________________________________________________________________________________-\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanDiscussion(s: string): string {
  return s
    .replace(/\n*(CHAPTER THREE|PAGE \d+)\s*\n*/gi, "\n")
    .replace(/\n*SP 800-171, REVISION 2[\s\S]*?________________________________________________________________________________________________-\s*\n*/gi, "\n")
    .replace(/This publication is available free of charge from:[\s\S]*?NIST\.SP\.800-171r2\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Max length for control title (display in mock assessment, lists). */
const TITLE_MAX_LEN = 120;

/**
 * Derive a short display title from the requirement text.
 * Avoids ingesting run-on text (e.g. "...; and finally followed by the") by stopping at
 * first sentence, semicolon, or " and " / " and finally", then capping length at word boundary.
 */
function deriveTitle(requirementText: string): string {
  const firstLine = requirementText.split("\n")[0].trim();
  if (!firstLine) {
    const fallback = requirementText.trim().slice(0, TITLE_MAX_LEN);
    return truncateAtWord(fallback, TITLE_MAX_LEN);
  }
  // Stop at first sentence or clause that often starts run-on text
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

function truncateAtWord(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen + 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.slice(0, lastSpace).trim();
  return cut.slice(0, maxLen).trim();
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((a) => !a.startsWith("--"));
  const outputArg = args.find((a) => a.startsWith("--output="));
  const outputPath = outputArg ? outputArg.split("=")[1] : null;

  if (!inputPath) {
    console.error("Usage: npx tsx src/scripts/parse-controls-from-guide.ts <path-to-pdf-or-txt> [--output=controls.json]");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved)) {
    console.error("File not found:", resolved);
    process.exit(1);
  }

  const ext = path.extname(resolved).toLowerCase();
  let rawText: string;

  if (ext === ".pdf") {
    console.error("Extracting text from PDF...");
    rawText = await extractTextFromPdf(resolved);
    console.error("Extracted", rawText.length, "characters");
  } else {
    rawText = fs.readFileSync(resolved, "utf-8");
  }

  const controls = parseControlBlocks(rawText);
  console.error("Parsed", controls.length, "controls");

  const json = JSON.stringify(controls, null, 2);

  if (outputPath) {
    const outResolved = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(outResolved, json, "utf-8");
    console.error("Wrote", outResolved);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
