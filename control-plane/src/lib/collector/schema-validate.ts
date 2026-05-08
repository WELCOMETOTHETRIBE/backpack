/**
 * Validate collector run output JSON against JSON Schemas (run_manifest, control_results, evidence_index).
 * Uses Ajv 2020-12 with uuid and date-time format support.
 */
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import path from "path";
import fs from "fs";

const SCHEMAS_DIR = path.join(process.cwd(), "src", "data", "collector", "schemas");

function loadSchema(filename: string): object {
  const filePath = path.join(SCHEMAS_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as object;
}

const runManifestSchema = loadSchema("collector_run_manifest.schema.v1.json");
const controlResultsSchema = loadSchema("collector_control_results.schema.v1.json");
const evidenceIndexSchema = loadSchema("collector_evidence_index.schema.v1.json");

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateRunManifestFn: ValidateFunction = ajv.compile(runManifestSchema);
const validateControlResultsFn: ValidateFunction = ajv.compile(controlResultsSchema);
const validateEvidenceIndexFn: ValidateFunction = ajv.compile(evidenceIndexSchema);

function formatErrors(validate: ValidateFunction, data: unknown): string[] {
  if (validate.errors) {
    return validate.errors.map(
      (e) => `${e.instancePath || "/"} ${e.message ?? "validation error"}`
    );
  }
  return [];
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validate a run manifest object against mactech.collector.run-manifest.v1 schema.
 */
export function validateRunManifest(obj: unknown): ValidateResult {
  const valid = validateRunManifestFn(obj);
  if (valid) return { ok: true };
  return { ok: false, errors: formatErrors(validateRunManifestFn, obj) };
}

/**
 * Validate a control results object against mactech.collector.control-results.v1 schema.
 */
export function validateControlResults(obj: unknown): ValidateResult {
  const valid = validateControlResultsFn(obj);
  if (valid) return { ok: true };
  return { ok: false, errors: formatErrors(validateControlResultsFn, obj) };
}

/**
 * Validate an evidence index object against mactech.collector.evidence-index.v1 schema.
 */
export function validateEvidenceIndex(obj: unknown): ValidateResult {
  const valid = validateEvidenceIndexFn(obj);
  if (valid) return { ok: true };
  return { ok: false, errors: formatErrors(validateEvidenceIndexFn, obj) };
}
