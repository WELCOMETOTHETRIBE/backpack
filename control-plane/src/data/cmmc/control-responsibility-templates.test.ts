import { describe, it, expect } from "vitest";
import {
  getControlResponsibilityTemplates,
  getResponsibilityByControlId,
} from "./control-responsibility-templates";

describe("control-responsibility-templates", () => {
  it("getControlResponsibilityTemplates returns full artifact with controls", () => {
    const t = getControlResponsibilityTemplates();
    expect(t.schema).toBeDefined();
    expect(t.controls).toBeInstanceOf(Array);
    expect(t.controls.length).toBe(110);
  });

  it("getResponsibilityByControlId returns template for 3.1.1", () => {
    const c = getResponsibilityByControlId("3.1.1");
    expect(c).not.toBeNull();
    expect(c!.control_id).toBe("3.1.1");
    expect(c!.family).toBe("AC");
    expect(["azure_inherited", "mactech_provided", "customer_managed", "shared"]).toContain(c!.responsibility_model);
    expect(Array.isArray(c!.azure_inherited)).toBe(true);
    expect(Array.isArray(c!.mactech_provided)).toBe(true);
    expect(Array.isArray(c!.customer_required)).toBe(true);
    expect(Array.isArray(c!.evidence_registers)).toBe(true);
  });

  it("getResponsibilityByControlId returns null for unknown control", () => {
    expect(getResponsibilityByControlId("99.99.99")).toBeNull();
  });
});
