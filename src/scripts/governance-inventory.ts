/**
 * Governance Document Inventory and Gap Analysis
 *
 * Reads artifact-guide (Governance-Centric controls + artifacts), os-evidence-nist-manifest
 * (PARTIAL controls), and artifact-label-to-document-mapping.json; outputs a markdown
 * inventory with Part 1 table, Part 2 table, and gap summary.
 *
 * Usage: npx tsx src/scripts/governance-inventory.ts
 * Output: control-plane/docs/Governance_Document_Inventory_and_Gap_Analysis.md
 */

import * as fs from "fs";
import * as path from "path";
import { CMMC_ARTIFACT_SPECS } from "../lib/artifact-guide";
import {
  GOVERNANCE_18_CONTROL_IDS,
  GOVERNANCE_18_ANALYSIS,
} from "../lib/compliance/governance-18-analysis";
import { PARTIAL_DOCS_TO_CLOSE } from "../lib/compliance/partialDocsToClose";

const CONTROL_PLANE_ROOT = path.resolve(__dirname, "../..");
const DOCS_DIR = path.join(CONTROL_PLANE_ROOT, "docs");
const GOVERNANCE_INVENTORY_DIR = path.join(DOCS_DIR, "governance-inventory");
const MANIFEST_PATH = path.join(CONTROL_PLANE_ROOT, "src/data/os-evidence-nist-manifest.json");
const MAPPING_PATH = path.join(GOVERNANCE_INVENTORY_DIR, "artifact-label-to-document-mapping.json");
const OUTPUT_PATH = path.join(DOCS_DIR, "Governance_Document_Inventory_and_Gap_Analysis.md");

function getPart2DocLabels(nist: string): string[] {
  return (PARTIAL_DOCS_TO_CLOSE[nist] ?? []).map((s) => s.label);
}

interface OsManifestControl {
  control_id: string;
  nist_req: string;
  title: string;
  support_level: string;
  evidence_files?: string[];
}

interface OsManifest {
  controls: OsManifestControl[];
}

interface MappingConfig {
  mapping: Record<string, string>;
}

function loadManifest(): OsManifest {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as OsManifest;
}

function loadMapping(): MappingConfig {
  const raw = fs.readFileSync(MAPPING_PATH, "utf-8");
  return JSON.parse(raw) as MappingConfig;
}

function getPathForLabel(mapping: Record<string, string>, label: string): string {
  const exact = mapping[label];
  if (exact !== undefined) return exact || "MISSING";
  for (const [key, value] of Object.entries(mapping)) {
    if (key.includes(label) || label.includes(key)) return value || "MISSING";
  }
  return "MISSING";
}

function isMissing(pathOrMissing: string): boolean {
  return !pathOrMissing || pathOrMissing === "MISSING" || pathOrMissing.startsWith("MISSING");
}

function main() {
  const manifest = loadManifest();
  const mappingConfig = loadMapping();
  const mapping = mappingConfig.mapping;

  const specByControlId = new Map(CMMC_ARTIFACT_SPECS.map((s) => [s.controlId, s]));
  const partialControls = manifest.controls.filter((c) => c.support_level === "PARTIAL");

  const allMissingLabels = new Map<string, string[]>();

  function recordMissing(label: string, controlId: string) {
    if (!allMissingLabels.has(label)) allMissingLabels.set(label, []);
    allMissingLabels.get(label)!.push(controlId);
  }

  const nistToTitle: Record<string, string> = {};
  for (const c of manifest.controls) {
    nistToTitle[c.nist_req] = c.title;
  }

  const lines: string[] = [];

  lines.push("# Governance Document Inventory and Gap Analysis");
  lines.push("");
  lines.push("**Generated:** " + new Date().toISOString().slice(0, 10));
  lines.push("");
  lines.push(
    "This document maps required governance artifacts (from the artifact guide and OS evidence manifest) to existing documents in the mactech repository. Paths are relative to the **mactech** repo root."
  );
  lines.push("");

  /** For the 18 governance controls: get required doc labels (artifact guide or GOVERNANCE_18_ANALYSIS). */
  function getPart1DocLabels(controlId: string): string[] {
    const spec = specByControlId.get(controlId);
    if (spec && spec.satisfactionType === "Governance-Centric") {
      const labels = spec.artifacts
        .filter((a) => a.label !== "N/A (Technical implementation)")
        .map((a) => a.label);
      if (labels.length > 0) return labels;
    }
    const analysis = GOVERNANCE_18_ANALYSIS[controlId];
    if (analysis?.primaryDocuments?.length)
      return analysis.primaryDocuments.map((d) => d.name);
    return [];
  }

  function getPart1Title(controlId: string): string {
    return GOVERNANCE_18_ANALYSIS[controlId]?.title ?? nistToTitle[controlId] ?? controlId;
  }

  // ---- Part 1 matrix (18 governance controls only) ----
  lines.push("## Matrix: Part 1 — 18 governance controls");
  lines.push("");
  lines.push("| Control ID | Title | Have document? |");
  lines.push("|------------|-------|----------------|");

  for (const controlId of GOVERNANCE_18_CONTROL_IDS) {
    const title = getPart1Title(controlId);
    const docLabels = getPart1DocLabels(controlId);
    let anyMissing = false;
    for (const label of docLabels) {
      const p = getPathForLabel(mapping, label);
      if (isMissing(p)) {
        anyMissing = true;
        recordMissing(label, controlId);
      }
    }
    const haveDocument = docLabels.length === 0 ? true : !anyMissing;
    lines.push(`| ${controlId} | ${title} | ${haveDocument ? "Yes" : "No"} |`);
  }

  lines.push("");
  lines.push("## Matrix: Part 2 — 31 PARTIAL controls (OS validation)");
  lines.push("");
  lines.push("| Control ID | Title | Have document? |");
  lines.push("|------------|-------|----------------|");

  for (const c of partialControls) {
    const nist = c.nist_req;
    const spec = specByControlId.get(nist);
    const part2Override = getPart2DocLabels(nist);

    let docLabels: string[];
    if (part2Override.length > 0) {
      docLabels = part2Override;
    } else if (spec && (spec.satisfactionType === "Governance-Centric" || spec.satisfactionType === "Hybrid")) {
      docLabels = spec.artifacts.filter((a) => a.label !== "N/A (Technical implementation)").map((a) => a.label);
    } else {
      docLabels = ["Governance docs, logs, or records (see assessment guide)"];
    }

    let anyMissing = false;
    for (const label of docLabels) {
      const p = getPathForLabel(mapping, label);
      if (isMissing(p)) {
        anyMissing = true;
        recordMissing(label, c.control_id);
      }
    }
    const haveDocument = !anyMissing;
    lines.push(`| ${c.control_id} | ${c.title} | ${haveDocument ? "Yes" : "No"} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Part 1: 18 governance controls — detail");
  lines.push("");
  lines.push(
    "Required governance docs per control (from artifact guide or CMMC 18 Governance analysis). Paths relative to mactech repo."
  );
  lines.push("");
  lines.push("| Control ID | Title | Required governance docs | Our document(s) | Status |");
  lines.push("|------------|-------|---------------------------|-----------------|--------|");

  for (const controlId of GOVERNANCE_18_CONTROL_IDS) {
    const title = getPart1Title(controlId);
    const docLabels = getPart1DocLabels(controlId);
    const pathList: string[] = [];
    let anyMissing = false;
    for (const label of docLabels) {
      const p = getPathForLabel(mapping, label);
      pathList.push(p);
      if (isMissing(p)) anyMissing = true;
    }
    const status = docLabels.length === 0 ? "Met" : anyMissing ? "Missing" : "Met";
    lines.push(
      `| ${controlId} | ${title} | ${docLabels.join("; ") || "—"} | ${pathList.join("; ") || "—"} | ${status} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Part 2: 31 PARTIAL controls (OS validation) — detail");
  lines.push("");
  lines.push(
    "These controls have technical evidence from the OS run but require additional governance docs, logs, or records to close."
  );
  lines.push("");
  lines.push("| Control ID | Title | Docs to close PARTIAL | Our document(s) | Status |");
  lines.push("|------------|-------|------------------------|-----------------|--------|");

  for (const c of partialControls) {
    const nist = c.nist_req;
    const spec = specByControlId.get(nist);
    const part2Override = getPart2DocLabels(nist);

    let docLabels: string[];
    if (part2Override.length > 0) {
      docLabels = part2Override;
    } else if (spec && (spec.satisfactionType === "Governance-Centric" || spec.satisfactionType === "Hybrid")) {
      docLabels = spec.artifacts.filter((a) => a.label !== "N/A (Technical implementation)").map((a) => a.label);
    } else {
      docLabels = ["Governance docs, logs, or records (see assessment guide)"];
    }

    const pathList: string[] = [];
    let anyMissing = false;
    for (const label of docLabels) {
      const p = getPathForLabel(mapping, label);
      pathList.push(p);
      if (isMissing(p)) anyMissing = true;
    }
    const status = anyMissing ? "Missing" : "Met";
    lines.push(`| ${c.control_id} | ${c.title} | ${docLabels.join("; ")} | ${pathList.join("; ")} | ${status} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Gap summary: missing artifact labels");
  lines.push("");
  lines.push(
    "The following artifact labels have no mapped document (or path is empty). Add or link documents for these to close the associated controls."
  );
  lines.push("");

  const missingEntries = Array.from(allMissingLabels.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (missingEntries.length === 0) {
    lines.push("*No gaps: all required artifacts are mapped to a document.*");
  } else {
    lines.push("| Artifact label | Required by control(s) |");
    lines.push("|----------------|------------------------|");
    for (const [label, controlIds] of missingEntries) {
      const unique = [...new Set(controlIds)];
      lines.push(`| ${label} | ${unique.join(", ")} |`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Regenerating this report");
  lines.push("");
  lines.push("Run from the control-plane directory:");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run governance-inventory");
  lines.push("```");
  lines.push("");
  lines.push(
    "Update `docs/governance-inventory/artifact-label-to-document-mapping.json` to map new or changed artifact labels to mactech paths."
  );
  lines.push("");

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf-8");
  console.log("Wrote", OUTPUT_PATH);
}

main();
