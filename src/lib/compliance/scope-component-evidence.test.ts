import { describe, it, expect } from "vitest";
import { getEvidenceFamiliesForScopeComponents } from "./scope-component-evidence";

describe("getEvidenceFamiliesForScopeComponents", () => {
  it("returns AU and SI when scope includes siem_logging", () => {
    const set = getEvidenceFamiliesForScopeComponents(["siem_logging"]);
    expect(set.has("AU")).toBe(true);
    expect(set.has("SI")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("returns SI when scope includes endpoint_detection_response", () => {
    const set = getEvidenceFamiliesForScopeComponents(["endpoint_detection_response"]);
    expect(set.has("SI")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("returns MA when scope includes backup_recovery", () => {
    const set = getEvidenceFamiliesForScopeComponents(["backup_recovery"]);
    expect(set.has("MA")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("returns SC when scope includes key_management", () => {
    const set = getEvidenceFamiliesForScopeComponents(["key_management"]);
    expect(set.has("SC")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("returns empty set when scope_components is null", () => {
    const set = getEvidenceFamiliesForScopeComponents(null);
    expect(set.size).toBe(0);
  });

  it("returns empty set when scope_components is empty array", () => {
    const set = getEvidenceFamiliesForScopeComponents([]);
    expect(set.size).toBe(0);
  });

  it("returns unchanged behavior for legacy-only scope (no scope-to-family mapping)", () => {
    const set = getEvidenceFamiliesForScopeComponents(["microsoft_office", "windows_server_vm", "azure_cloud"]);
    expect(set.size).toBe(0);
  });

  it("unions families when multiple mapped components present", () => {
    const set = getEvidenceFamiliesForScopeComponents([
      "siem_logging",
      "endpoint_detection_response",
      "key_management",
    ]);
    expect(set.has("AU")).toBe(true);
    expect(set.has("SI")).toBe(true);
    expect(set.has("SC")).toBe(true);
    expect(set.size).toBe(3);
  });
});
