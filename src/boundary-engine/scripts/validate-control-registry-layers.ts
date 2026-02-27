#!/usr/bin/env npx tsx
/**
 * Validates a control registry JSON against the layers ontology.
 * Reports unknown layers (missing or not in ontology) and ambiguous layers
 * (e.g. "Identity/Access + Logging" or comma-separated).
 * Exit code 1 if any issues found.
 *
 * Usage:
 *   npx tsx src/boundary-engine/scripts/validate-control-registry-layers.ts <registry.json> [ontology.json]
 * If ontology.json is omitted, uses src/boundary-engine/data/ontology/layers_ontology.v1.json
 */

import path from "path";
import fs from "fs";

const DEFAULT_ONTOLOGY_PATH = path.join(
  process.cwd(),
  "src",
  "boundary-engine",
  "data",
  "ontology",
  "layers_ontology.v1.json"
);

interface OntologyLayer {
  id: string;
  domain?: string;
  description?: string;
  examples?: string[];
}

interface LayersOntology {
  ontology_id: string;
  version: string;
  layers: OntologyLayer[];
}

interface ControlEntry {
  control_id: string;
  layer?: string;
  [key: string]: unknown;
}

interface Report {
  unknown_layer: Array<{ control_id: string; layer: string | undefined; reason: "unknown_layer" }>;
  ambiguous_layer: Array<{ control_id: string; layer: string; reason: "ambiguous_layer" }>;
}

function loadJson<T>(filePath: string): T {
  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  return JSON.parse(raw) as T;
}

/** Heuristic: layer string looks like multiple concerns (e.g. "X + Y" or "X, Y"). */
function isAmbiguousLayer(layer: string): boolean {
  const s = layer.trim();
  if (!s) return false;
  if (s.includes("+")) return true;
  if (s.includes(" and ") || s.includes(" & ")) return true;
  if (s.includes(",")) return true;
  if (/\b(or|and)\b/i.test(s)) return true;
  return false;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: validate-control-registry-layers.ts <registry.json> [ontology.json]");
    process.exit(2);
  }
  const registryPath = args[0];
  const ontologyPath = args[1] ?? DEFAULT_ONTOLOGY_PATH;

  const ontology = loadJson<LayersOntology>(ontologyPath);
  const layerSet = new Set(ontology.layers.map((l) => l.id));

  let registry: ControlEntry[];
  try {
    const data = loadJson<ControlEntry[] | { controls: ControlEntry[] }>(registryPath);
    registry = Array.isArray(data) ? data : data.controls ?? [];
  } catch (e) {
    console.error("Failed to load registry:", e);
    process.exit(2);
  }

  const report: Report = {
    unknown_layer: [],
    ambiguous_layer: [],
  };

  for (const control of registry) {
    const layer = control.layer;
    if (layer == null || String(layer).trim() === "") {
      report.unknown_layer.push({
        control_id: control.control_id,
        layer: undefined,
        reason: "unknown_layer",
      });
      continue;
    }
    const layerStr = String(layer).trim();
    if (isAmbiguousLayer(layerStr)) {
      report.ambiguous_layer.push({
        control_id: control.control_id,
        layer: layerStr,
        reason: "ambiguous_layer",
      });
    }
    if (!layerSet.has(layerStr)) {
      report.unknown_layer.push({
        control_id: control.control_id,
        layer: layerStr,
        reason: "unknown_layer",
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  const hasIssues =
    report.unknown_layer.length > 0 || report.ambiguous_layer.length > 0;
  if (hasIssues) {
    process.exit(1);
  }
}

main();
