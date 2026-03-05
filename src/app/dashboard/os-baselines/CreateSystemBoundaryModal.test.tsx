import { describe, it, expect } from "vitest";
import { CreateSystemBoundaryModal, SCOPE_OPTIONS } from "./CreateSystemBoundaryModal";

/**
 * Tests that CreateSystemBoundaryModal uses grouped SCOPE_OPTIONS with expected sections and values.
 */
describe("CreateSystemBoundaryModal", () => {
  it("exports CreateSystemBoundaryModal component", () => {
    expect(CreateSystemBoundaryModal).toBeDefined();
    expect(typeof CreateSystemBoundaryModal).toBe("function");
  });

  it("renders grouped scope options with Compute, Cloud Hosting, Identity & Access, etc.", () => {
    const labels = SCOPE_OPTIONS.map((g) => g.label);
    expect(labels).toContain("Compute");
    expect(labels).toContain("Cloud Hosting");
    expect(labels).toContain("Identity & Access");
    expect(labels).toContain("Administrative Access");
    expect(labels).toContain("Network Protection");
    expect(labels).toContain("Storage");
    expect(labels).toContain("Monitoring & Detection");
    expect(labels).toContain("Recovery");
    expect(labels).toContain("Productivity");
  });

  it("Compute group has windows_server_vm, linux_server_vm, virtual_desktop", () => {
    const compute = SCOPE_OPTIONS.find((g) => g.label === "Compute");
    expect(compute).toBeDefined();
    const values = compute!.items.map((i) => i.value);
    expect(values).toContain("windows_server_vm");
    expect(values).toContain("linux_server_vm");
    expect(values).toContain("virtual_desktop");
  });
});
