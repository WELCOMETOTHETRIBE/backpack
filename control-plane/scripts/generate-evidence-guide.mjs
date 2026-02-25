#!/usr/bin/env node
/**
 * One-off: parse docs/CMMC_Unified_Guide.md and generate src/lib/compliance/control_evidence_guide.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "docs", "CMMC_Unified_Guide.md");
const outPath = path.join(root, "src", "lib", "compliance", "control_evidence_guide.ts");

const md = fs.readFileSync(mdPath, "utf8");
const lines = md.split("\n");

const controlRowRe = /^\|\s*(3\.\d+\.\d+)\s*\|\s*(.+)\s*\|$/;
const inheritedRe = /^\s*\*\*Inherited:\*\*\s*`([^`]+)`\s*$/;

const guide = {};

for (const line of lines) {
  const m = line.match(controlRowRe);
  if (!m) continue;
  const [, controlId, cell] = m;
  const afterEvidence = cell.indexOf("**Example Evidence:**");
  if (afterEvidence === -1) continue;
  const evidenceBlock = cell.slice(afterEvidence + "**Example Evidence:**".length);
  const bullets = evidenceBlock.split(/<br>\s*/).map((s) => s.trim()).filter(Boolean);
  const evidenceExamples = [];
  let inheritedFrom;
  for (const raw of bullets) {
    const text = raw.replace(/^•\s*/, "").trim();
    if (!text) continue;
    const inh = text.match(inheritedRe);
    if (inh) {
      inheritedFrom = inh[1].trim();
      continue;
    }
    if (text.startsWith("**Inherited:**")) {
      const backtick = text.indexOf("`");
      if (backtick !== -1) {
        const end = text.indexOf("`", backtick + 1);
        inheritedFrom = end !== -1 ? text.slice(backtick + 1, end).trim() : text.replace(/^\*\*Inherited:\*\*\s*/, "").trim();
      }
      continue;
    }
    evidenceExamples.push(text.replace(/`/g, "").trim() || text);
  }

  guide[controlId] = {
    evidenceExamples,
    ...(inheritedFrom ? { inheritedFrom } : {}),
  };
}

const entries = Object.entries(guide)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

function escape(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const ts = `/**
 * Unified evidence guide per control (example filenames and inherited notice).
 * Source: docs/CMMC_Unified_Guide.md — do not duplicate adjudication questions (see control_adjudication_questions.ts).
 */

export interface ControlEvidenceGuideEntry {
  /** Filenames or document names the user should upload or reference as evidence. */
  evidenceExamples: string[];
  /**
   * If this control is satisfied by a cloud provider's FedRAMP authorization,
   * set this to the name of that authorization (e.g., "Azure Government FedRAMP High Authorization (SC-28)").
   * When set, the ControlCard should display an "Inherited" badge instead of the question flow.
   */
  inheritedFrom?: string;
}

export const CONTROL_EVIDENCE_GUIDE: Record<string, ControlEvidenceGuideEntry> = {
${entries
  .map(([id, e]) => {
    const examples = e.evidenceExamples.map((s) => `    "${escape(s)}"`).join(",\n");
    const inh = e.inheritedFrom ? `,\n  inheritedFrom: "${escape(e.inheritedFrom)}"` : "";
    return `  "${id}": {\n    evidenceExamples: [\n${examples}\n    ]${inh}\n  }`;
  })
  .join(",\n")}
};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, ts, "utf8");
console.log("Wrote", outPath, "with", entries.length, "controls");
console.log("Inherited controls:", entries.filter(([, e]) => e.inheritedFrom).map(([id]) => id).join(", "));