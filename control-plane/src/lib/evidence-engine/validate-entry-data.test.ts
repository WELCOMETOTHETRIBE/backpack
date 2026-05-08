import { describe, it, expect } from "vitest";
import { validateEntryData } from "./validate-entry-data";
import type { RegisterEntryType } from "@/data/cmmc/types";

const grantAccessSchema: RegisterEntryType = {
  type: "grant_access",
  short_help: "Document approval to grant access.",
  required: ["subject_user", "approver", "approved_at", "requested_role"],
  optional: ["notes"],
  enums: {
    requested_role: ["viewer", "admin"],
  },
  recommended_attachments: [],
};

describe("validateEntryData", () => {
  it("returns success for valid data with required and enum", () => {
    const result = validateEntryData(grantAccessSchema, {
      subject_user: "alice",
      approver: "bob",
      approved_at: "2025-01-15",
      requested_role: "viewer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject_user).toBe("alice");
      expect(result.data.requested_role).toBe("viewer");
    }
  });

  it("returns success when optional fields omitted", () => {
    const result = validateEntryData(grantAccessSchema, {
      subject_user: "alice",
      approver: "bob",
      approved_at: "2025-01-15",
      requested_role: "viewer",
    });
    expect(result.success).toBe(true);
  });

  it("returns fields for missing required field", () => {
    const result = validateEntryData(grantAccessSchema, {
      subject_user: "alice",
      approver: "bob",
      // missing approved_at
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fields.approved_at).toBeDefined();
      expect(result.fields.approved_at?.length).toBeGreaterThan(0);
    }
  });

  it("returns fields for invalid enum value", () => {
    const result = validateEntryData(grantAccessSchema, {
      subject_user: "alice",
      approver: "bob",
      approved_at: "2025-01-15",
      requested_role: "superuser",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fields.requested_role).toBeDefined();
    }
  });

  it("returns fields for empty required string", () => {
    const result = validateEntryData(grantAccessSchema, {
      subject_user: "",
      approver: "bob",
      approved_at: "2025-01-15",
      requested_role: "viewer",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fields.subject_user).toBeDefined();
    }
  });
});
