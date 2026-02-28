import { createHash } from "crypto";

export interface SnapshotAttestationInput {
  boundaryId: string;
  allocationHash: string;
  registryVersion: string;
  providerProfileId: string;
  catalogId: string;
  evidenceRunFingerprints: string[];
  coverage?: {
    coverageHash: string;
    runFingerprint: string;
    collectedAt: string;
  };
}

export function computeSnapshotSignature(input: SnapshotAttestationInput): string {
  const ev = [...input.evidenceRunFingerprints].sort();

  const coverageHash = input.coverage?.coverageHash ?? "";
  const runFingerprint = input.coverage?.runFingerprint ?? "";
  const collectedAt = input.coverage?.collectedAt ?? "";
  const hasCoverage = coverageHash !== "" || runFingerprint !== "" || collectedAt !== "";
  const payload: Record<string, unknown> = {
    boundaryId: input.boundaryId,
    allocationHash: input.allocationHash,
    registryVersion: input.registryVersion ?? "",
    providerProfileId: input.providerProfileId,
    catalogId: input.catalogId,
    evidenceRunFingerprints: ev,
  };
  if (hasCoverage) {
    payload.coverage = { coverageHash, runFingerprint, collectedAt };
  }

  const stableStringify = (obj: unknown): string => {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  };

  const canonical = stableStringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}
