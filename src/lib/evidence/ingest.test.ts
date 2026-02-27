import { describe, it, expect } from "vitest";
import {
  computeInputsManifestSha256,
  computeRunFingerprint,
} from "./ingest";

describe("ingest", () => {
  describe("computeRunFingerprint", () => {
    it("same inputs produce same fingerprint", () => {
      const a = computeRunFingerprint({
        source: "windows_server_hardening",
        validator_sha256: "abc",
        inputs_manifest_sha256: "def",
      });
      const b = computeRunFingerprint({
        source: "windows_server_hardening",
        validator_sha256: "abc",
        inputs_manifest_sha256: "def",
      });
      expect(a).toBe(b);
    });

    it("different validator_sha256 produces different fingerprint", () => {
      const a = computeRunFingerprint({
        source: "x",
        validator_sha256: "a",
        inputs_manifest_sha256: "z",
      });
      const b = computeRunFingerprint({
        source: "x",
        validator_sha256: "b",
        inputs_manifest_sha256: "z",
      });
      expect(a).not.toBe(b);
    });

    it("different inputs_manifest_sha256 produces different fingerprint", () => {
      const a = computeRunFingerprint({
        source: "x",
        validator_sha256: "y",
        inputs_manifest_sha256: "z1",
      });
      const b = computeRunFingerprint({
        source: "x",
        validator_sha256: "y",
        inputs_manifest_sha256: "z2",
      });
      expect(a).not.toBe(b);
    });

    it("different source produces different fingerprint", () => {
      const a = computeRunFingerprint({
        source: "azure_entra",
        validator_sha256: "y",
        inputs_manifest_sha256: "z",
      });
      const b = computeRunFingerprint({
        source: "windows_server_hardening",
        validator_sha256: "y",
        inputs_manifest_sha256: "z",
      });
      expect(a).not.toBe(b);
    });
  });

  describe("computeInputsManifestSha256", () => {
    it("same inputs produce same hash (determinism)", () => {
      const inputs = [
        { filename: "b.txt", sha256: "b", size: 1 },
        { filename: "a.txt", sha256: "a", size: 0 },
      ];
      const h1 = computeInputsManifestSha256(inputs);
      const h2 = computeInputsManifestSha256([...inputs]);
      expect(h1).toBe(h2);
    });

    it("sorted by filename for canonical form", () => {
      const a = computeInputsManifestSha256([
        { filename: "b.txt" },
        { filename: "a.txt" },
      ]);
      const b = computeInputsManifestSha256([
        { filename: "a.txt" },
        { filename: "b.txt" },
      ]);
      expect(a).toBe(b);
    });

    it("different content produces different hash", () => {
      const h1 = computeInputsManifestSha256([{ filename: "a.txt" }]);
      const h2 = computeInputsManifestSha256([{ filename: "b.txt" }]);
      expect(h1).not.toBe(h2);
    });
  });
});
