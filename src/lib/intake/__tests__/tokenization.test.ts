import { describe, expect, it } from "vitest";

import { buildTokenizedObjectAlias } from "@/lib/intake/service";

describe("intake metadata tokenization", () => {
  it("creates deterministic alias/hash without raw filename leakage", () => {
    const out = buildTokenizedObjectAlias({
      intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
      originalFilename: "CUI-Prime-Contract-StatementOfWork.pdf",
    });
    expect(out.objectAlias).toMatch(/^INTAKEOBJ-/);
    expect(out.objectAlias).not.toContain("StatementOfWork");
    expect(out.originalFilenameHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
