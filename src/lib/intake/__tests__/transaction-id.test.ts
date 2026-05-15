import { describe, expect, it } from "vitest";

import { buildIntakeTransactionId } from "@/lib/intake/transaction-id";

describe("buildIntakeTransactionId", () => {
  it("builds deterministic transaction ids with zero-padded sequence", () => {
    const id = buildIntakeTransactionId({
      clientCode: "ew audet",
      projectCode: "homeport",
      sequence: 1,
      now: new Date("2026-05-14T12:00:00.000Z"),
    });
    expect(id).toBe("INTAKE-EWAUDET-HOMEPORT-20260514-0001");
  });

  it("sanitizes unsafe characters and falls back when empty", () => {
    const id = buildIntakeTransactionId({
      clientCode: "***",
      projectCode: "***",
      sequence: 12,
      now: new Date("2026-05-14T12:00:00.000Z"),
    });
    expect(id).toBe("INTAKE-CLIENT-PROJECT-20260514-0012");
  });
});
