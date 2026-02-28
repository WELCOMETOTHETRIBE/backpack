import { describe, it, expect } from "vitest";
import { isEnclaveMappedControl, getEnclaveMappedControls } from "./enclaveManifest";

describe("enclaveManifest", () => {
  describe("isEnclaveMappedControl", () => {
    it("returns true for NIST ids in the 73 enclave set", () => {
      expect(isEnclaveMappedControl("3.1.22")).toBe(true);
      expect(isEnclaveMappedControl("3.3.5")).toBe(true);
      expect(isEnclaveMappedControl("3.4.3")).toBe(true);
      expect(isEnclaveMappedControl("3.14.7")).toBe(true);
    });

    it("returns false for controls not in enclave manifest", () => {
      expect(isEnclaveMappedControl("3.1.4")).toBe(false);
      expect(isEnclaveMappedControl("3.2.1")).toBe(false);
    });
  });

  describe("getEnclaveMappedControls", () => {
    it("returns 73 control ids", () => {
      const ids = getEnclaveMappedControls();
      expect(ids).toHaveLength(73);
      expect(ids).toContain("3.1.22");
      expect(ids).toContain("3.14.7");
    });
  });
});
