import { describe, expect, it } from "vitest";

import { canTransitionIntakeStatus, type IntakeStatus } from "@/lib/intake/status";

describe("intake lifecycle happy path", () => {
  it("supports full end-to-end status progression", () => {
    const path: IntakeStatus[] = [
      "Draft",
      "Pending Authorization",
      "Upload Scope Provisioned",
      "Awaiting Upload",
      "Uploaded",
      "Scan Pending",
      "Scan Clean",
      "Hash Generated",
      "Ready for Vault Import",
      "Imported to Vault",
      "Reviewer Approved",
      "Access Revoked",
      "Evidence Package Generated",
      "Closed",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionIntakeStatus(path[i], path[i + 1])).toBe(true);
    }
  });
});
