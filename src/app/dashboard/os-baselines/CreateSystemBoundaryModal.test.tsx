import { describe, it, expect } from "vitest";
import { CreateSystemBoundaryModal } from "./CreateSystemBoundaryModal";
import { SCOPE_OPTIONS } from "@/types/boundary";

/**
 * Tests that CreateSystemBoundaryModal exists and that SCOPE_OPTIONS has the expected DIB CMMC structure.
 */
describe("CreateSystemBoundaryModal", () => {
  it("exports CreateSystemBoundaryModal component", () => {
    expect(CreateSystemBoundaryModal).toBeDefined();
    expect(typeof CreateSystemBoundaryModal).toBe("function");
  });

  it("SCOPE_OPTIONS contains expected DIB CMMC groups", () => {
    const labels = SCOPE_OPTIONS.map((g) => g.label);
    expect(labels.some((l) => l.includes("Compute"))).toBe(true);
    expect(labels.some((l) => l.includes("Cloud"))).toBe(true);
    expect(labels.some((l) => l.includes("Identity"))).toBe(true);
    expect(labels.some((l) => l.includes("Network"))).toBe(true);
    expect(labels.some((l) => l.includes("Monitoring"))).toBe(true);
    expect(labels.some((l) => l.includes("Recovery"))).toBe(true);
  });

  it("Compute group includes windows_server_vm, linux_server_vm, virtual_desktop", () => {
    const compute = SCOPE_OPTIONS.find((g) => g.label.includes("Compute"));
    expect(compute).toBeDefined();
    const values = compute!.items.map((i) => i.value);
    expect(values).toContain("windows_server_vm");
    expect(values).toContain("linux_server_vm");
    expect(values).toContain("virtual_desktop");
  });

  it("each scope group has a description", () => {
    for (const group of SCOPE_OPTIONS) {
      expect(typeof group.description).toBe("string");
      expect(group.description.length).toBeGreaterThan(0);
    }
  });
});
