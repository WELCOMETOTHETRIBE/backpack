/**
 * Reads docs/Governance_Document_Matrix.csv (single source of truth) and writes
 * src/lib/governance/governance-matrix-data.json for the app.
 * Run: npm run sync-matrix (or tsx src/scripts/sync-governance-matrix.ts)
 *
 * CSV columns: Governance Document, Gov Pure, Gov Hybrid, Tech/Hybrid, MACTech Document, Missing, Controls Mapped
 * Controls Mapped: semicolon-separated control IDs (e.g. 3.1.1;3.1.2;3.1.4). If empty, filled from artifact-guide.
 */

import * as fs from "fs";
import * as path from "path";
import { getControlIdsRequiringUploadLabel } from "../lib/artifact-guide";

const CSV_PATH = path.join(process.cwd(), "docs", "Governance_Document_Matrix.csv");
const OUT_PATH = path.join(process.cwd(), "src", "lib", "governance", "governance-matrix-data.json");

/** Map CSV document name -> artifact-guide label when they differ (so every matrix row gets correct controls). */
const DOCUMENT_TO_GUIDE_LABEL: Record<string, string> = {
  "Awareness and Training Policy": "Security Awareness and Training Policy",
  "Security Awareness Training Procedure": "Procedures for Security Awareness Training",
  "Audit Log Review Procedure": "Procedures for Audit Review, Analysis, and Reporting",
  "Configuration Change Procedure": "Procedures for Configuration Change Control",
  "Incident Response Testing Procedure": "Procedures for Incident Response Testing",
  "Personnel Screening Procedure": "Procedures for Personnel Screening",
  "Security Assessment Policy": "Security Assessment and Authorization Policy",
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length) {
        const next = line.indexOf('"', end);
        if (next === -1) break;
        if (line[next + 1] === '"') {
          end = next + 2;
          continue;
        }
        end = next;
        break;
      }
      out.push(line.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 1;
      if (line[i] === ",") i++;
      continue;
    }
    const comma = line.indexOf(",", i);
    if (comma === -1) {
      out.push(line.slice(i).trim());
      break;
    }
    out.push(line.slice(i, comma).trim());
    i = comma + 1;
  }
  return out;
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]!);
  const controlsMappedIdx = header.findIndex((h) => h === "Controls Mapped");
  const docIdx = header.findIndex((h) => h === "Governance Document");
  const govPureIdx = header.findIndex((h) => h === "Gov Pure");
  const govHybridIdx = header.findIndex((h) => h === "Gov Hybrid");
  const techHybridIdx = header.findIndex((h) => h === "Tech/Hybrid");
  const mactechIdx = header.findIndex((h) => h === "MACTech Document");
  const missingIdx = header.findIndex((h) => h === "Missing");

  if (
    docIdx < 0 ||
    govPureIdx < 0 ||
    govHybridIdx < 0 ||
    techHybridIdx < 0 ||
    mactechIdx < 0 ||
    controlsMappedIdx < 0
  ) {
    throw new Error("CSV missing required columns");
  }

  const rows: Array<{
    document: string;
    govPure: boolean;
    govHybrid: boolean;
    techHybrid: boolean;
    mactechDocument: string;
    missing: boolean;
    controlsMapped: string[];
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const document = cells[docIdx]?.trim() ?? "";
    if (!document) continue;

    let controlsMapped: string[] = [];
    const rawMapped = cells[controlsMappedIdx]?.trim() ?? "";
    if (rawMapped) {
      controlsMapped = rawMapped.split(/[;,]\s*/).map((s) => s.trim()).filter(Boolean);
    }
    if (controlsMapped.length === 0) {
      const guideLabel = DOCUMENT_TO_GUIDE_LABEL[document] ?? document;
      controlsMapped = getControlIdsRequiringUploadLabel(guideLabel);
    }

    const govPure = (cells[govPureIdx] ?? "").trim().toLowerCase() === "yes";
    const govHybrid = (cells[govHybridIdx] ?? "").trim().toLowerCase() === "yes";
    const techHybrid = (cells[techHybridIdx] ?? "").trim().toLowerCase() === "yes";
    const mactechDocument = (cells[mactechIdx] ?? "").trim();
    const missingCell = (cells[missingIdx] ?? "").trim().toLowerCase();
    const missing = !mactechDocument || missingCell === "yes" || missingCell === "add";

    rows.push({
      document,
      govPure,
      govHybrid,
      techHybrid,
      mactechDocument,
      missing,
      controlsMapped,
    });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ rows }, null, 2), "utf-8");

  // Write CSV back with Controls Mapped so the file stays the single source of truth (fill empty from guide/alias)
  const headerLine = lines[0]!;
  const newLines: string[] = [headerLine];
  let rowIndex = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const cells = parseCsvLine(line);
    const document = cells[docIdx]?.trim() ?? "";
    if (!document) {
      newLines.push(line);
      continue;
    }
    const row = rows[rowIndex++];
    const existingMapped = (cells[controlsMappedIdx] ?? "").trim();
    const useMapped = existingMapped ? existingMapped.split(/[;,]\s*/).map((s) => s.trim()).filter(Boolean) : (row?.controlsMapped ?? []);
    if (row && useMapped.length > 0) {
      cells[controlsMappedIdx] = useMapped.join(";");
      newLines.push(cells.map((c) => (c.includes(",") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(","));
    } else {
      newLines.push(line);
    }
  }
  fs.writeFileSync(CSV_PATH, newLines.join("\n") + "\n", "utf-8");

  console.log(`Wrote ${OUT_PATH} (${rows.length} rows). Edit docs/Governance_Document_Matrix.csv and run npm run sync-matrix to update.`);
}

main();
