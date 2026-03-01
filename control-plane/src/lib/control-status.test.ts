import { describe, it, expect } from "vitest";
import {
  isGovernanceComplete,
  type GovernanceCompletionRow,
} from "./control-status";
import type { RequiredArtifactSpec } from "./artifact-guide";

describe("control-status", () => {
  describe("isGovernanceComplete", () => {
    it("returns true when no required specs", () => {
      expect(
        isGovernanceComplete([], new Set(), new Map())
      ).toBe(true);
    });

    it("returns false when PARTIAL control has required REFERENCE artifact without value_text", () => {
      const required: RequiredArtifactSpec[] = [
        { label: "Security alert monitoring and response records", type: "REFERENCE" },
      ];
      const uploadedLabels = new Set<string>();
      const completionByLabel = new Map<string, GovernanceCompletionRow>();
      expect(isGovernanceComplete(required, uploadedLabels, completionByLabel)).toBe(false);
    });

    it("returns true when PARTIAL control has required REFERENCE artifact with value_text", () => {
      const required: RequiredArtifactSpec[] = [
        { label: "Security alert monitoring and response records", type: "REFERENCE" },
      ];
      const uploadedLabels = new Set<string>();
      const completionByLabel = new Map<string, GovernanceCompletionRow>([
        [
          "Security alert monitoring and response records",
          {
            artifactLabel: "Security alert monitoring and response records",
            artifactType: "REFERENCE",
            valueText: "ticket-123",
            attestedBy: null,
            attestedAt: null,
          },
        ],
      ]);
      expect(isGovernanceComplete(required, uploadedLabels, completionByLabel)).toBe(true);
    });

    it("returns false when REFERENCE completion has empty value_text", () => {
      const required: RequiredArtifactSpec[] = [
        { label: "Records of actions taken", type: "REFERENCE" },
      ];
      const completionByLabel = new Map<string, GovernanceCompletionRow>([
        [
          "Records of actions taken",
          {
            artifactLabel: "Records of actions taken",
            artifactType: "REFERENCE",
            valueText: "   ",
            attestedBy: null,
            attestedAt: null,
          },
        ],
      ]);
      expect(isGovernanceComplete(required, new Set(), completionByLabel)).toBe(false);
    });

    it("returns true when all UPLOAD and REFERENCE satisfied", () => {
      const required: RequiredArtifactSpec[] = [
        { label: "Procedures for System Monitoring", type: "UPLOAD" },
        { label: "Security alert monitoring and response records", type: "REFERENCE" },
      ];
      const uploadedLabels = new Set(["Procedures for System Monitoring"]);
      const completionByLabel = new Map<string, GovernanceCompletionRow>([
        [
          "Security alert monitoring and response records",
          {
            artifactLabel: "Security alert monitoring and response records",
            artifactType: "REFERENCE",
            valueText: "ref-1",
            attestedBy: null,
            attestedAt: null,
          },
        ],
      ]);
      expect(isGovernanceComplete(required, uploadedLabels, completionByLabel)).toBe(true);
    });

    it("returns true when ATTESTATION has attested_by and attested_at", () => {
      const required: RequiredArtifactSpec[] = [
        { label: "Attestation for X", type: "ATTESTATION" },
      ];
      const completionByLabel = new Map<string, GovernanceCompletionRow>([
        [
          "Attestation for X",
          {
            artifactLabel: "Attestation for X",
            artifactType: "ATTESTATION",
            valueText: null,
            attestedBy: "user-id",
            attestedAt: new Date(),
          },
        ],
      ]);
      expect(isGovernanceComplete(required, new Set(), completionByLabel)).toBe(true);
    });

    it("returns false when ATTESTATION missing attested_at", () => {
      const required: RequiredArtifactSpec[] = [
        { label: "Attestation for X", type: "ATTESTATION" },
      ];
      const completionByLabel = new Map<string, GovernanceCompletionRow>([
        [
          "Attestation for X",
          {
            artifactLabel: "Attestation for X",
            artifactType: "ATTESTATION",
            valueText: null,
            attestedBy: "user-id",
            attestedAt: null,
          },
        ],
      ]);
      expect(isGovernanceComplete(required, new Set(), completionByLabel)).toBe(false);
    });
  });
});
