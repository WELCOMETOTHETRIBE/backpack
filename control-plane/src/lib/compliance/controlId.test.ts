import { describe, it, expect } from "vitest";
import { controlIdToNist, isNistControlId } from "./controlId";

describe("controlId", () => {
  describe("controlIdToNist", () => {
    it("strips report prefix to NIST form", () => {
      expect(controlIdToNist("AC.L2-3.1.22")).toBe("3.1.22");
      expect(controlIdToNist("AU.L2-3.3.5")).toBe("3.3.5");
      expect(controlIdToNist("CM.L2-3.4.3")).toBe("3.4.3");
    });

    it("returns NIST form as-is", () => {
      expect(controlIdToNist("3.1.22")).toBe("3.1.22");
      expect(controlIdToNist("3.14.7")).toBe("3.14.7");
    });

    it("trims whitespace", () => {
      expect(controlIdToNist("  3.1.22  ")).toBe("3.1.22");
      expect(controlIdToNist("  AC.L2-3.1.22  ")).toBe("3.1.22");
    });
  });

  describe("isNistControlId", () => {
    it("returns true for NIST form", () => {
      expect(isNistControlId("3.1.22")).toBe(true);
      expect(isNistControlId("3.14.7")).toBe(true);
    });

    it("returns false for report form", () => {
      expect(isNistControlId("AC.L2-3.1.22")).toBe(false);
    });

    it("returns false for empty or non-matching", () => {
      expect(isNistControlId("")).toBe(false);
      expect(isNistControlId("  ")).toBe(false);
    });
  });
});
