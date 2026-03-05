import { describe, it, expect } from "vitest";
import { boundaries } from "./schema";

describe("boundary table", () => {
  it("boundary_type column has default cui_enclave", () => {
    const boundaryTypeCol = boundaries.boundaryType;
    expect(boundaryTypeCol).toBeDefined();
    const def = (boundaryTypeCol as { default?: unknown }).default;
    expect(def).toBeDefined();
    const defVal = typeof def === "function" ? (def as () => string)() : def;
    expect(String(defVal)).toBe("cui_enclave");
  });
});
