import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import {
  validateRunManifest,
  validateControlResults,
  validateEvidenceIndex,
} from "./schema-validate";

const EXAMPLES_DIR = path.join(process.cwd(), "collector_integration_package");

function loadJson(filename: string): unknown {
  const filePath = path.join(EXAMPLES_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

describe("schema-validate", () => {
  describe("validateRunManifest", () => {
    it("passes for valid run_manifest.example.json", () => {
      const data = loadJson("run_manifest.example.json");
      const result = validateRunManifest(data);
      expect(result.ok).toBe(true);
    });

    it("fails when required field schema is missing", () => {
      const data = loadJson("run_manifest.example.json") as Record<string, unknown>;
      const { schema: _s, ...withoutSchema } = data;
      const result = validateRunManifest(withoutSchema);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when boundary_id is not a valid UUID", () => {
      const data = loadJson("run_manifest.example.json") as Record<string, unknown>;
      const invalid = { ...data, boundary_id: "not-a-uuid" };
      const result = validateRunManifest(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when run_id is too short", () => {
      const data = loadJson("run_manifest.example.json") as Record<string, unknown>;
      const invalid = { ...data, run_id: "short" };
      const result = validateRunManifest(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateControlResults", () => {
    it("passes for valid control_results.example.json", () => {
      const data = loadJson("control_results.example.json");
      const result = validateControlResults(data);
      expect(result.ok).toBe(true);
    });

    it("fails when results is missing", () => {
      const data = loadJson("control_results.example.json") as Record<string, unknown>;
      const { results: _r, ...withoutResults } = data;
      const result = validateControlResults(withoutResults);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when organization_id is invalid UUID", () => {
      const data = loadJson("control_results.example.json") as Record<string, unknown>;
      const invalid = { ...data, organization_id: "x" };
      const result = validateControlResults(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when a result status is invalid", () => {
      const data = loadJson("control_results.example.json") as Record<string, unknown>;
      const results = (data.results as Record<string, unknown>) ?? {};
      const invalid = {
        ...data,
        results: { ...results, "AC.L2-3.1.3": { ...(results["AC.L2-3.1.3"] as object), status: "invalid" } },
      };
      const result = validateControlResults(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateEvidenceIndex", () => {
    it("passes for valid evidence_index.example.json", () => {
      const data = loadJson("evidence_index.example.json");
      const result = validateEvidenceIndex(data);
      expect(result.ok).toBe(true);
    });

    it("fails when files is missing", () => {
      const data = loadJson("evidence_index.example.json") as Record<string, unknown>;
      const { files: _f, ...withoutFiles } = data;
      const result = validateEvidenceIndex(withoutFiles);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when a file sha256 is not 64 hex chars", () => {
      const data = loadJson("evidence_index.example.json") as Record<string, unknown>;
      const files = (data.files as Record<string, unknown>[]) ?? [];
      const invalidFiles = [...files];
      invalidFiles[0] = { ...(files[0] as object), sha256: "tooshort" };
      const invalid = { ...data, files: invalidFiles };
      const result = validateEvidenceIndex(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });

    it("fails when boundary_id is not UUID", () => {
      const data = loadJson("evidence_index.example.json") as Record<string, unknown>;
      const invalid = { ...data, boundary_id: "not-uuid" };
      const result = validateEvidenceIndex(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
