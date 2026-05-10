import { describe, expect, it, vi } from "vitest";
import { dismissDriftEvent } from "./baseline-drift";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

describe("dismissDriftEvent rationale guard", () => {
  // Per spec: adjudication actions require rationale. The dismiss
  // path is the only one that hard-rejects empty rationale at the
  // service layer (acknowledge accepts notes optionally, since
  // acknowledging without deciding is a real workflow). This
  // verifies the guard fires before any DB call.
  it("throws when rationale is empty", async () => {
    await expect(
      dismissDriftEvent({
        organizationId: "org-1",
        driftEventId: "evt-1",
        userId: "user-1",
        rationale: "",
      }),
    ).rejects.toThrow(/rationale/);
  });

  it("throws when rationale is whitespace-only", async () => {
    await expect(
      dismissDriftEvent({
        organizationId: "org-1",
        driftEventId: "evt-1",
        userId: "user-1",
        rationale: "   \n\t  ",
      }),
    ).rejects.toThrow(/rationale/);
  });

  it("does not throw when a non-empty rationale is provided", async () => {
    await expect(
      dismissDriftEvent({
        organizationId: "org-1",
        driftEventId: "evt-1",
        userId: "user-1",
        rationale: "Boundary component was a transient test VM, removed before reassessment.",
      }),
    ).resolves.toBeUndefined();
  });
});
