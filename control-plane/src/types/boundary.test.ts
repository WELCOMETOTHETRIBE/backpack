import { describe, it, expect } from "vitest";
import { validateScopeComponents, SCOPE_COMPONENT_VALUES, type ScopeComponent } from "./boundary";

describe("boundary types", () => {
  it("ScopeComponent accepts valid canonical values", () => {
    const valid: ScopeComponent[] = [
      "microsoft_office",
      "windows_server_vm",
      "azure_cloud",
      "siem_logging",
      "endpoint_detection_response",
      "backup_recovery",
      "key_management",
    ];
    valid.forEach((v) => {
      expect(SCOPE_COMPONENT_VALUES).toContain(v);
    });
  });

  it("validateScopeComponents returns ok and deduped array for valid input", () => {
    const result = validateScopeComponents(["azure_cloud", "windows_server_vm", "azure_cloud"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(["azure_cloud", "windows_server_vm"]);
    }
  });

  it("validateScopeComponents returns error when not an array", () => {
    const result = validateScopeComponents("azure_cloud");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("array");
  });

  it("validateScopeComponents returns error for invalid value", () => {
    const result = validateScopeComponents(["azure_cloud", "sentinel"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("invalid scope_components");
      expect(result.error).toContain("sentinel");
    }
  });

  it("validateScopeComponents returns ok for empty array", () => {
    const result = validateScopeComponents([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });
});
